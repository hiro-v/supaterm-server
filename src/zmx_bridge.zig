const std = @import("std");
const posix = std.posix;
const zmx_ipc = @import("zmx_ipc");

pub const Tag = zmx_ipc.Tag;
pub const Info = zmx_ipc.Info;
pub const Resize = zmx_ipc.Resize;
pub const SocketBuffer = zmx_ipc.SocketBuffer;

pub const ProbeError = error{
    Timeout,
    ConnectionRefused,
    Unexpected,
};

pub const ProbeResult = struct {
    fd: posix.fd_t,
    info: Info,
};

pub const SocketPathError = error{
    NameTooLong,
    FileNotUnixSocket,
};

pub const maxSocketPathLen = @typeInfo(@TypeOf(@as(posix.sockaddr.un, undefined).path)).array.len - 1;

pub fn send(fd: posix.fd_t, tag: Tag, data: []const u8) !void {
    try zmx_ipc.send(fd, tag, data);
}

pub fn getSocketPath(alloc: std.mem.Allocator, socket_dir: []const u8, session_name: []const u8) ![]const u8 {
    const path_len = socket_dir.len + 1 + session_name.len;
    if (path_len > maxSocketPathLen) return SocketPathError.NameTooLong;

    const path = try alloc.alloc(u8, path_len);
    @memcpy(path[0..socket_dir.len], socket_dir);
    path[socket_dir.len] = '/';
    @memcpy(path[socket_dir.len + 1 ..], session_name);
    return path;
}

pub fn sessionExists(dir: std.fs.Dir, session_name: []const u8) !bool {
    const stat = dir.statFile(session_name) catch |err| switch (err) {
        error.FileNotFound => return false,
        else => return err,
    };

    if (stat.kind != .unix_domain_socket) {
        return SocketPathError.FileNotUnixSocket;
    }
    return true;
}

pub fn cleanupStaleSocket(dir: std.fs.Dir, session_name: []const u8) void {
    dir.deleteFile(session_name) catch |err| {
        std.log.warn("failed to delete stale socket session={s} err={s}", .{
            session_name,
            @errorName(err),
        });
    };
}

pub fn ensureSocketDir(socket_dir: []const u8) !void {
    std.fs.cwd().makePath(socket_dir) catch |err| switch (err) {
        error.PathAlreadyExists => {},
        else => return err,
    };
}

pub fn probeSession(alloc: std.mem.Allocator, socket_path: []const u8) ProbeError!ProbeResult {
    const inner = zmx_ipc.probeSession(alloc, socket_path) catch |err| switch (err) {
        error.ConnectionRefused => return ProbeError.ConnectionRefused,
        error.Timeout => return ProbeError.Timeout,
        else => return ProbeError.Unexpected,
    };

    return ProbeResult{
        .fd = inner.fd,
        .info = inner.info,
    };
}
