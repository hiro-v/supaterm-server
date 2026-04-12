const std = @import("std");
const posix = std.posix;
const cross = @import("cross.zig");
const zmx = @import("zmx_bridge");

extern "c" fn setenv(name: [*:0]const u8, value: [*:0]const u8, overwrite: c_int) c_int;

fn configureTerminalEnv() void {
    if (setenv("TERM", "xterm-256color", 1) != 0) std.process.exit(1);
    if (setenv("COLORTERM", "truecolor", 1) != 0) std.process.exit(1);
    if (setenv("TERM_PROGRAM", "supaterm-web", 1) != 0) std.process.exit(1);
    if (setenv("TERM_PROGRAM_VERSION", "0.1.0", 1) != 0) std.process.exit(1);
    if (setenv("CLICOLOR", "1", 1) != 0) std.process.exit(1);
}

pub const BackendMode = enum {
    local,
    zmx,
};

pub const BackendOptions = struct {
    cols: u16 = 80,
    rows: u16 = 24,
    command: ?[]const u8 = null,
};

pub const ZmxClientOptions = struct {
    socket_dir: ?[]const u8 = null,
    session_prefix: []const u8 = "",
    binary: []const u8 = "zmx",
    spawn_retries: u16 = 160,
    spawn_wait_ms: u16 = 25,
};

pub const BackendError = error{
    BackendSpawnFailed,
    BackendNotAlive,
    BackendReadError,
    BackendWriteError,
    InvalidSessionName,
    InvalidSessionType,
    SocketPathTooLong,
    SpawnNotAvailable,
    ProtocolError,
    ZmxBinaryUnavailable,
    ZmxSocketCreateFailed,
};

pub const BackendVTable = struct {
    read_fn: *const fn (ctx: *anyopaque, out: []u8) BackendError!usize,
    write_fn: *const fn (ctx: *anyopaque, data: []const u8) BackendError!void,
    resize_fn: *const fn (ctx: *anyopaque, rows: u16, cols: u16) BackendError!void,
    close_fn: *const fn (ctx: *anyopaque) void,
};

pub const BackendHandle = struct {
    ctx: *anyopaque,
    vtable: *const BackendVTable,

    pub fn read(self: BackendHandle, out: []u8) !usize {
        return self.vtable.read_fn(self.ctx, out);
    }

    pub fn write(self: BackendHandle, data: []const u8) !void {
        return self.vtable.write_fn(self.ctx, data);
    }

    pub fn resize(self: BackendHandle, rows: u16, cols: u16) !void {
        return self.vtable.resize_fn(self.ctx, rows, cols);
    }

    pub fn close(self: BackendHandle) void {
        self.vtable.close_fn(self.ctx);
    }
};

pub const LocalPtyBackend = struct {
    allocator: std.mem.Allocator,
    master_fd: posix.fd_t,
    child_pid: posix.pid_t,
    alive: bool,

    pub fn init(allocator: std.mem.Allocator, opts: BackendOptions) !BackendHandle {
        var session = try allocator.create(LocalPtyBackend);
        session.allocator = allocator;
        session.alive = false;
        session.master_fd = -1;
        session.child_pid = -1;

        const cols = if (opts.cols == 0) 80 else opts.cols;
        const rows = if (opts.rows == 0) 24 else opts.rows;

        var ws = cross.c.struct_winsize{
            .ws_row = @intCast(rows),
            .ws_col = @intCast(cols),
            .ws_xpixel = 0,
            .ws_ypixel = 0,
        };

        var master: posix.fd_t = -1;
        const pid = cross.forkpty(&master, null, null, &ws);
        if (pid == -1) {
            allocator.destroy(session);
            return BackendError.BackendSpawnFailed;
        }

        if (pid == 0) {
            configureTerminalEnv();
            const shell = std.posix.getenv("SHELL") orelse "/bin/sh";
            const shell_txt = std.fmt.allocPrint(allocator, "{s}", .{shell}) catch std.process.exit(1);
            defer allocator.free(shell_txt);
            const shell_z = toCStr(allocator, shell_txt) catch std.process.exit(1);
            defer allocator.free(shell_z);

            if (opts.command) |cmd| {
                const cmd_txt = std.fmt.allocPrint(allocator, "{s}", .{cmd}) catch std.process.exit(1);
                defer allocator.free(cmd_txt);
                const cmd_z = toCStr(allocator, cmd_txt) catch std.process.exit(1);
                defer allocator.free(cmd_z);
                const shell_arg = toCStr(allocator, "-c") catch std.process.exit(1);
                defer allocator.free(shell_arg);

                const argv: [4:null]?[*:0]const u8 = .{
                    shell_z.ptr,
                    shell_arg.ptr,
                    cmd_z.ptr,
                    null,
                };
                std.posix.execvpeZ(shell_z.ptr, &argv, std.c.environ) catch std.process.exit(1);
            } else {
                const login_txt = std.fmt.allocPrint(allocator, "-{s}", .{std.fs.path.basename(shell)}) catch std.process.exit(1);
                defer allocator.free(login_txt);
                const login = toCStr(allocator, login_txt) catch std.process.exit(1);
                defer allocator.free(login);
                const argv: [2:null]?[*:0]const u8 = .{
                    login.ptr,
                    null,
                };
                std.posix.execvpeZ(shell_z.ptr, &argv, std.c.environ) catch std.process.exit(1);
            }

            // If exec fails, exit the child immediately.
            std.process.exit(1);
        }

        session.master_fd = master;
        session.child_pid = pid;
        session.alive = true;

        return .{
            .ctx = session,
            .vtable = &local_vtable,
        };
    }

    fn readImpl(ctx: *anyopaque, out: []u8) !usize {
        const self: *LocalPtyBackend = @ptrCast(@alignCast(ctx));
        if (!self.alive or self.master_fd < 0) return BackendError.BackendNotAlive;
        const n = posix.read(self.master_fd, out) catch |err| switch (err) {
            error.WouldBlock => return 0,
            else => return BackendError.BackendReadError,
        };
        if (n == 0) {
            self.alive = false;
        }
        return n;
    }

    fn writeImpl(ctx: *anyopaque, data: []const u8) !void {
        const self: *LocalPtyBackend = @ptrCast(@alignCast(ctx));
        if (!self.alive or self.master_fd < 0) return BackendError.BackendNotAlive;
        if (data.len == 0) return;

        var written: usize = 0;
        while (written < data.len) {
            const n = posix.write(self.master_fd, data[written..]) catch return BackendError.BackendWriteError;
            if (n == 0) return BackendError.BackendWriteError;
            written += n;
        }
    }

    fn resizeImpl(ctx: *anyopaque, rows: u16, cols: u16) !void {
        const self: *LocalPtyBackend = @ptrCast(@alignCast(ctx));
        if (self.master_fd < 0) return BackendError.BackendNotAlive;

        const ws = cross.c.struct_winsize{
            .ws_row = @intCast(rows),
            .ws_col = @intCast(cols),
            .ws_xpixel = 0,
            .ws_ypixel = 0,
        };
        if (cross.c.ioctl(self.master_fd, cross.c.TIOCSWINSZ, &ws) != 0) {
            return BackendError.BackendWriteError;
        }
    }

    fn closeImpl(ctx: *anyopaque) void {
        const self: *LocalPtyBackend = @ptrCast(@alignCast(ctx));
        if (!self.alive and self.master_fd < 0) return;

        self.alive = false;
        if (self.child_pid > 0) {
            posix.kill(self.child_pid, posix.SIG.TERM) catch {};
            _ = posix.waitpid(self.child_pid, posix.W.NOHANG);
        }

        if (self.master_fd >= 0) {
            _ = posix.close(self.master_fd);
            self.master_fd = -1;
        }
        self.child_pid = -1;

        self.allocator.destroy(self);
    }
};

fn toCStr(allocator: std.mem.Allocator, value: []const u8) ![:0]u8 {
    const buf = try allocator.alloc(u8, value.len + 1);
    @memcpy(buf[0..value.len], value);
    buf[value.len] = 0;
    return buf[0..value.len :0];
}

const local_vtable = BackendVTable{
    .read_fn = LocalPtyBackend.readImpl,
    .write_fn = LocalPtyBackend.writeImpl,
    .resize_fn = LocalPtyBackend.resizeImpl,
    .close_fn = LocalPtyBackend.closeImpl,
};

pub fn createBackend(
    allocator: std.mem.Allocator,
    mode: BackendMode,
    session_id: []const u8,
    opts: BackendOptions,
    zmx_opts: ZmxClientOptions,
) !BackendHandle {
    return switch (mode) {
        .local => try LocalPtyBackend.init(allocator, opts),
        .zmx => try createZmxBackend(allocator, session_id, opts, zmx_opts),
    };
}

const IpcTag = zmx.Tag;
const IpcResize = zmx.Resize;
const IpcSocketBuffer = zmx.SocketBuffer;

fn validateSessionName(name: []const u8) !void {
    if (std.mem.indexOfScalar(u8, name, '/') != null) return BackendError.InvalidSessionName;
    if (std.mem.indexOfScalar(u8, name, 0) != null) return BackendError.InvalidSessionName;
    if (name.len == 0 or std.mem.eql(u8, name, ".") or std.mem.eql(u8, name, "..")) {
        return BackendError.InvalidSessionName;
    }
}

fn resolveZmxSocketDir(allocator: std.mem.Allocator, override_path: ?[]const u8) ![]const u8 {
    if (override_path) |dir| {
        const socket_dir = try allocator.dupe(u8, dir);
        try zmx.ensureSocketDir(socket_dir);
        return socket_dir;
    }

    if (std.posix.getenv("ZMX_DIR")) |value| {
        const socket_dir = try allocator.dupe(u8, value);
        try zmx.ensureSocketDir(socket_dir);
        return socket_dir;
    }

    const tmpdir = std.mem.trimRight(u8, std.posix.getenv("TMPDIR") orelse "/tmp", "/");
    if (std.posix.getenv("XDG_RUNTIME_DIR")) |xdg| {
        const socket_dir = try std.fmt.allocPrint(allocator, "{s}/zmx", .{xdg});
        try zmx.ensureSocketDir(socket_dir);
        return socket_dir;
    }

    const uid = posix.getuid();
    const socket_dir = try std.fmt.allocPrint(allocator, "{s}/zmx-{d}", .{ tmpdir, uid });
    try zmx.ensureSocketDir(socket_dir);
    return socket_dir;
}

fn getSocketPath(allocator: std.mem.Allocator, socket_dir: []const u8, session_name: []const u8) ![]const u8 {
    return zmx.getSocketPath(allocator, socket_dir, session_name) catch |err| switch (err) {
        error.NameTooLong => BackendError.SocketPathTooLong,
        else => err,
    };
}

fn sanitizeSessionName(allocator: std.mem.Allocator, session_id: []const u8, prefix: []const u8) ![]const u8 {
    try validateSessionName(session_id);

    const out_len = prefix.len + session_id.len;
    const full = try allocator.alloc(u8, out_len);
    @memcpy(full[0..prefix.len], prefix);
    @memcpy(full[prefix.len..], session_id);
    return full;
}

fn connectToZmxSocket(socket_path: []const u8) !posix.fd_t {
    var unix_addr = try std.net.Address.initUnix(socket_path);
    const fd = try posix.socket(posix.AF.UNIX, posix.SOCK.STREAM | posix.SOCK.CLOEXEC, 0);
    errdefer posix.close(fd);

    try posix.connect(fd, &unix_addr.any, unix_addr.getOsSockLen());
    return fd;
}

fn sendIpcMessage(fd: posix.fd_t, tag: IpcTag, data: []const u8) !void {
    try zmx.send(fd, tag, data);
}

const ZmxBackend = struct {
    allocator: std.mem.Allocator,
    fd: posix.fd_t,
    socket_path: []const u8,
    read_buffer: IpcSocketBuffer,
    pending_output: std.ArrayList(u8),
    alive: bool,

    fn init(
        allocator: std.mem.Allocator,
        fd: posix.fd_t,
        socket_path: []const u8,
        cols: u16,
        rows: u16,
    ) !BackendHandle {
        var backend = try allocator.create(ZmxBackend);
        backend.* = .{
            .allocator = allocator,
            .fd = fd,
            .socket_path = socket_path,
            .read_buffer = try IpcSocketBuffer.init(allocator),
            .pending_output = try std.ArrayList(u8).initCapacity(allocator, 0),
            .alive = true,
        };

        const size = IpcResize{ .rows = rows, .cols = cols };
        sendIpcMessage(fd, .Init, std.mem.asBytes(&size)) catch |err| {
            backend.deinit();
            return err;
        };

        return .{
            .ctx = backend,
            .vtable = &zmx_vtable,
        };
    }

    fn deinit(self: *ZmxBackend) void {
        if (!self.alive) return;
        self.alive = false;
        if (self.fd >= 0) {
            _ = posix.close(self.fd);
            self.fd = -1;
        }
        self.read_buffer.deinit();
        self.pending_output.deinit(self.allocator);
        self.allocator.free(self.socket_path);
        self.allocator.destroy(self);
    }

    fn readImpl(ctx: *anyopaque, out: []u8) !usize {
        const self: *ZmxBackend = @ptrCast(@alignCast(ctx));
        if (!self.alive or self.fd < 0) return BackendError.BackendNotAlive;

        if (self.pending_output.items.len > 0) {
            const n = @min(out.len, self.pending_output.items.len);
            if (n > 0) {
                std.mem.copyForwards(u8, out[0..n], self.pending_output.items[0..n]);
                if (n < self.pending_output.items.len) {
                    const remain = self.pending_output.items[n..];
                    std.mem.copyForwards(u8, self.pending_output.items[0..remain.len], remain);
                    self.pending_output.items.len -= n;
                } else {
                    self.pending_output.clearRetainingCapacity();
                }
            }
            return n;
        }

        var out_i: usize = 0;
        while (true) {
            while (self.read_buffer.next()) |msg| {
                switch (msg.header.tag) {
                    .Output => {
                        if (msg.payload.len == 0) continue;

                        const remaining = out.len - out_i;
                        if (msg.payload.len <= remaining) {
                            std.mem.copyForwards(u8, out[out_i .. out_i + msg.payload.len], msg.payload);
                            out_i += msg.payload.len;
                        } else {
                            std.mem.copyForwards(u8, out[out_i..], msg.payload[0..remaining]);
                            self.pending_output.appendSlice(self.allocator, msg.payload[remaining..]) catch {
                                return BackendError.BackendReadError;
                            };
                            out_i += remaining;
                        }
                    },
                    .Resize => {},
                    else => {},
                }
                if (out_i > 0) return out_i;
            }

            const n = self.read_buffer.read(self.fd) catch |err| switch (err) {
                error.WouldBlock => return 0,
                else => return BackendError.BackendReadError,
            };
            if (n == 0) {
                self.alive = false;
                return out_i;
            }
            if (out_i > 0) {
                return out_i;
            }
        }
    }

    fn writeImpl(ctx: *anyopaque, data: []const u8) !void {
        const self: *ZmxBackend = @ptrCast(@alignCast(ctx));
        if (!self.alive or self.fd < 0) return BackendError.BackendNotAlive;
        if (data.len == 0) return;

        sendIpcMessage(self.fd, .Input, data) catch {
            self.alive = false;
            return BackendError.BackendWriteError;
        };
    }

    fn resizeImpl(ctx: *anyopaque, rows: u16, cols: u16) !void {
        const self: *ZmxBackend = @ptrCast(@alignCast(ctx));
        if (!self.alive or self.fd < 0) return BackendError.BackendNotAlive;

        const size = IpcResize{ .rows = rows, .cols = cols };
        sendIpcMessage(self.fd, .Resize, std.mem.asBytes(&size)) catch {
            self.alive = false;
            return BackendError.BackendWriteError;
        };
    }

    fn closeImpl(ctx: *anyopaque) void {
        const self: *ZmxBackend = @ptrCast(@alignCast(ctx));
        if (!self.alive) return;
        sendIpcMessage(self.fd, .Detach, "") catch {};
        self.deinit();
    }
};

const zmx_vtable = BackendVTable{
    .read_fn = ZmxBackend.readImpl,
    .write_fn = ZmxBackend.writeImpl,
    .resize_fn = ZmxBackend.resizeImpl,
    .close_fn = ZmxBackend.closeImpl,
};

fn spawnZmxSession(
    allocator: std.mem.Allocator,
    session_name: []const u8,
    command: ?[]const u8,
    cfg: ZmxClientOptions,
) !void {
    const binary_txt = try std.fmt.allocPrint(allocator, "{s}", .{cfg.binary});
    defer allocator.free(binary_txt);
    const binary = try toCStr(allocator, binary_txt);
    defer allocator.free(binary);
    const bootstrap = "bootstrap";
    const session_txt = try std.fmt.allocPrint(allocator, "{s}", .{session_name});
    defer allocator.free(session_txt);
    const session = try toCStr(allocator, session_txt);
    defer allocator.free(session);
    var socket_dir_c: ?[:0]u8 = null;
    defer if (socket_dir_c) |value| allocator.free(value);
    if (cfg.socket_dir) |dir| {
        socket_dir_c = try toCStr(allocator, dir);
    }

    var command_c: ?[:0]u8 = null;
    var shell_c: ?[:0]u8 = null;
    var shell_arg_c: ?[:0]u8 = null;

    if (command) |cmd| {
        const shell = try toCStr(allocator, std.posix.getenv("SHELL") orelse "/bin/sh");
        const shell_arg = try toCStr(allocator, "-c");
        const command_cstr = try toCStr(allocator, cmd);
        shell_c = shell;
        shell_arg_c = shell_arg;
        command_c = command_cstr;
    }

    defer if (command_c) |cmd| {
        allocator.free(cmd);
        if (shell_arg_c) |shell_arg| allocator.free(shell_arg);
        if (shell_c) |shell| allocator.free(shell);
    };

    const pid = posix.fork() catch |err| {
        std.log.warn("zmx attach fork failed for {s}: {s}", .{ session_name, @errorName(err) });
        return BackendError.SpawnNotAvailable;
    };

    if (pid == 0) {
        configureTerminalEnv();
        const devnull = posix.open("/dev/null", .{ .ACCMODE = .RDWR }, 0) catch std.process.exit(1);
        defer posix.close(devnull);
        posix.dup2(devnull, posix.STDIN_FILENO) catch std.process.exit(1);
        posix.dup2(devnull, posix.STDOUT_FILENO) catch std.process.exit(1);
        posix.dup2(devnull, posix.STDERR_FILENO) catch std.process.exit(1);
        if (socket_dir_c) |dir| {
            if (setenv("ZMX_DIR", dir.ptr, 1) != 0) {
                std.process.exit(1);
            }
        }

        if (command_c) |cmd| {
            const argv: [7:null]?[*:0]const u8 = .{
                binary,
                bootstrap,
                session,
                shell_c.?.ptr,
                shell_arg_c.?.ptr,
                cmd.ptr,
                null,
            };
            std.posix.execvpeZ(binary, &argv, std.c.environ) catch std.process.exit(1);
        } else {
            const argv: [4:null]?[*:0]const u8 = .{ binary, bootstrap, session, null };
            std.posix.execvpeZ(binary, &argv, std.c.environ) catch std.process.exit(1);
        }
        std.process.exit(1);
    }
}

fn connectToZmxSocketWithRetry(
    socket_path: []const u8,
    retries: u16,
    sleep_ms: u16,
) !posix.fd_t {
    var attempts: u16 = 0;
    while (attempts <= retries) : (attempts += 1) {
        if (connectToZmxSocket(socket_path)) |fd| {
            return fd;
        } else |err| {
            if (attempts >= retries) {
                return err;
            }
            std.Thread.sleep(@as(u64, sleep_ms) * std.time.ns_per_ms);
            continue;
        }
    }

    return BackendError.BackendSpawnFailed;
}

fn connectOrCreateZmxSocket(
    allocator: std.mem.Allocator,
    session_name: []const u8,
    socket_path: []const u8,
    socket_dir: []const u8,
    command: ?[]const u8,
    cfg: ZmxClientOptions,
) !posix.fd_t {
    var dir = try std.fs.openDirAbsolute(socket_dir, .{});
    defer dir.close();

    const session_exists = zmx.sessionExists(dir, session_name) catch |err| switch (err) {
        error.FileNotFound => false,
        error.FileNotUnixSocket => return BackendError.InvalidSessionType,
        else => return err,
    };
    var should_create = !session_exists;

    if (session_exists) {
        if (zmx.probeSession(allocator, socket_path)) |probe| {
            defer posix.close(probe.fd);
            return connectToZmxSocketWithRetry(
                socket_path,
                cfg.spawn_retries,
                cfg.spawn_wait_ms,
            ) catch |err| {
                std.log.err("zmx socket attach failed for session={s}: {s}", .{ session_name, @errorName(err) });
                return BackendError.BackendSpawnFailed;
            };
        } else |err| switch (err) {
            zmx.ProbeError.ConnectionRefused => {
                std.log.warn("zmx socket stale for session={s}, cleaning before recreate", .{session_name});
                zmx.cleanupStaleSocket(dir, session_name);
                should_create = true;
            },
            zmx.ProbeError.Timeout => {
                std.log.warn("zmx session probe timed out for session={s}, attaching attempt will continue", .{session_name});
            },
            zmx.ProbeError.Unexpected => {
                std.log.warn("zmx session probe unexpected result for session={s}, attaching attempt will continue", .{session_name});
            },
        }
    }

    if (should_create) {
        std.log.warn("zmx session not found or stale, bootstrapping {s}", .{session_name});
        try spawnZmxSession(allocator, session_name, command, cfg);
    }

    return connectToZmxSocketWithRetry(
        socket_path,
        cfg.spawn_retries,
        cfg.spawn_wait_ms,
    ) catch |err| {
        std.log.err("zmx socket connect failed after retry for {s}: {s}", .{
            socket_path,
            @errorName(err),
        });
        return BackendError.BackendSpawnFailed;
    };
}

pub fn createZmxBackend(
    allocator: std.mem.Allocator,
    session_id: []const u8,
    opts: BackendOptions,
    cfg: ZmxClientOptions,
) !BackendHandle {
    const full_name = try sanitizeSessionName(allocator, session_id, cfg.session_prefix);
    defer allocator.free(full_name);

    const socket_dir = try resolveZmxSocketDir(allocator, cfg.socket_dir);
    defer allocator.free(socket_dir);

    const socket_path = try getSocketPath(allocator, socket_dir, full_name);
    errdefer allocator.free(socket_path);

    const fd = connectOrCreateZmxSocket(allocator, full_name, socket_path, socket_dir, opts.command, cfg) catch {
        return BackendError.BackendSpawnFailed;
    };

    return try ZmxBackend.init(allocator, fd, socket_path, opts.cols, opts.rows);
}
