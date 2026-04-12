const std = @import("std");
const posix = std.posix;
const ws_frames = @import("ws_frames.zig");
const backends = @import("session_backends.zig");
const HmacSha256 = std.crypto.auth.hmac.sha2.HmacSha256;

pub const SessionOptions = struct {
    cols: u16 = 80,
    rows: u16 = 24,
    command: ?[]const u8 = null,
    token: ?[]const u8 = null,
};

pub const ManagerError = error{
    Unauthorized,
};

pub const TokenPolicyMode = enum {
    open,
    global,
    session,
};

pub const TokenPolicy = struct {
    mode: TokenPolicyMode = .open,
    global_token: ?[]const u8 = null,
    share_secret: ?[]const u8 = null,
};

pub const ShareAuthority = enum {
    server,
    host,
};

pub const ShareTokenTransport = enum {
    none,
    query,
};

pub const ShareGrant = struct {
    token: ?[]const u8 = null,
    token_transport: ShareTokenTransport = .none,
    expires_at_unix_ms: ?i64 = null,
    authority: ShareAuthority = .server,
    token_owned: bool = false,

    pub fn deinit(self: *ShareGrant, allocator: std.mem.Allocator) void {
        if (self.token_owned and self.token != null) {
            allocator.free(self.token.?);
        }
        self.* = .{};
    }
};

pub const BackendFactory = struct {
    context: ?*anyopaque = null,
    create_fn: ?*const fn (
        context: ?*anyopaque,
        allocator: std.mem.Allocator,
        mode: backends.BackendMode,
        session_id: []const u8,
        opts: SessionOptions,
        zmx_opts: backends.ZmxClientOptions,
    ) anyerror!backends.BackendHandle = null,
};

pub const Authorizer = struct {
    context: ?*anyopaque = null,
    authorize_fn: ?*const fn (context: ?*anyopaque, session_id: []const u8, token: ?[]const u8) bool = null,
};

pub const ShareIssuer = struct {
    context: ?*anyopaque = null,
    issue_fn: ?*const fn (
        context: ?*anyopaque,
        allocator: std.mem.Allocator,
        session_id: []const u8,
    ) anyerror!ShareGrant = null,
};

pub const SessionHandle = struct {
    session: *Session,
    client_id: u64,
    manager: *SessionManager,

    pub fn deinit(self: *SessionHandle) void {
        self.manager.detach(self);
    }
};

const ClientConn = struct {
    id: u64,
    ws_fd: posix.fd_t,
};

pub const Session = struct {
    allocator: std.mem.Allocator,
    id: []const u8,
    backend: backends.BackendHandle,
    manager: *SessionManager,
    clients: std.array_list.Managed(*ClientConn),
    clients_lock: std.Thread.Mutex,
    io_lock: std.Thread.Mutex,
    output_thread: std.Thread,
    thread_started: bool,
    alive: bool,
    queued_for_cleanup: bool,

    pub fn init(
        allocator: std.mem.Allocator,
        manager: *SessionManager,
        id: []const u8,
        opts: SessionOptions,
    ) !*Session {
        const backend = try manager.createBackend(
            allocator,
            id,
            opts,
        );

        const session = try allocator.create(Session);
        session.* = .{
            .allocator = allocator,
            .id = id,
            .backend = backend,
            .manager = manager,
            .clients = std.array_list.Managed(*ClientConn).init(allocator),
            .clients_lock = .{},
            .io_lock = .{},
            .output_thread = undefined,
            .thread_started = false,
            .alive = true,
            .queued_for_cleanup = false,
        };
        return session;
    }

    pub fn startOutputPump(self: *Session) !void {
        self.io_lock.lock();
        defer self.io_lock.unlock();
        if (self.thread_started) {
            return;
        }
        self.output_thread = try std.Thread.spawn(.{}, outputPump, .{self});
        self.thread_started = true;
    }

    fn outputPump(self: *Session) void {
        var output: [4096]u8 = undefined;

        while (self.alive) {
            const n = self.backend.read(&output) catch {
                self.io_lock.lock();
                self.alive = false;
                self.io_lock.unlock();
                break;
            };

            if (n == 0) {
                if (!self.alive) break;
                continue;
            }

            self.clients_lock.lock();
            if (self.clients.items.len == 0) {
                self.clients_lock.unlock();
                continue;
            }

            var i: usize = 0;
            while (i < self.clients.items.len) {
                const client = self.clients.items[i];
                ws_frames.writeFrame(client.ws_fd, ws_frames.WebSocketOp.binary, output[0..n]) catch {
                    _ = posix.close(client.ws_fd);
                    _ = self.clients.swapRemove(i);
                    self.allocator.destroy(client);
                    continue;
                };
                i += 1;
            }
            self.clients_lock.unlock();
        }

        self.manager.markTerminated(self);
    }

    pub fn writeInput(self: *Session, data: []const u8) !void {
        self.io_lock.lock();
        defer self.io_lock.unlock();
        if (!self.alive) return backends.BackendError.BackendNotAlive;
        return self.backend.write(data);
    }

    pub fn resize(self: *Session, cols: u16, rows: u16) !void {
        self.io_lock.lock();
        defer self.io_lock.unlock();
        if (!self.alive) return backends.BackendError.BackendNotAlive;
        return self.backend.resize(rows, cols);
    }

    pub fn addClient(self: *Session, ws_fd: posix.fd_t, id: u64) !void {
        const client = try self.allocator.create(ClientConn);
        client.* = .{ .id = id, .ws_fd = ws_fd };

        self.clients_lock.lock();
        try self.clients.append(client);
        self.clients_lock.unlock();
    }

    pub fn removeClient(self: *Session, client_id: u64) bool {
        self.clients_lock.lock();
        defer self.clients_lock.unlock();

        var i: usize = 0;
        while (i < self.clients.items.len) {
            if (self.clients.items[i].id == client_id) {
                const client = self.clients.swapRemove(i);
                _ = posix.close(client.ws_fd);
                self.allocator.destroy(client);
                return true;
            }
            i += 1;
        }

        return false;
    }

    pub fn isAlive(self: *Session) bool {
        self.io_lock.lock();
        defer self.io_lock.unlock();
        return self.alive;
    }

    fn shutdown(self: *Session) void {
        self.io_lock.lock();
        if (self.alive) {
            self.alive = false;
            self.backend.close();
        }
        self.io_lock.unlock();
    }

    fn cleanupClients(self: *Session) void {
        self.clients_lock.lock();
        for (self.clients.items) |client| {
            _ = posix.close(client.ws_fd);
            self.allocator.destroy(client);
        }
        self.clients.clearRetainingCapacity();
        self.clients_lock.unlock();
    }

    fn joinOutputThread(self: *Session) void {
        if (!self.thread_started) return;
        self.output_thread.join();
        self.thread_started = false;
    }

    pub fn destroy(self: *Session) void {
        self.shutdown();
        self.joinOutputThread();
        self.cleanupClients();
        self.allocator.free(self.id);
        self.allocator.destroy(self);
    }
};

pub const SessionManager = struct {
    allocator: std.mem.Allocator,
    sessions: std.StringHashMap(*Session),
    terminated_sessions: std.array_list.Managed(*Session),
    lock: std.Thread.Mutex,
    next_client_id: u64,
    backend_mode: backends.BackendMode,
    zmx_opts: backends.ZmxClientOptions,
    token_policy: TokenPolicy,
    backend_factory: BackendFactory,
    authorizer: Authorizer,
    share_issuer: ShareIssuer,

    pub fn init(
        allocator: std.mem.Allocator,
        backend_mode: backends.BackendMode,
        zmx_opts: backends.ZmxClientOptions,
        token_policy: TokenPolicy,
    ) SessionManager {
        return .{
            .allocator = allocator,
            .sessions = std.StringHashMap(*Session).init(allocator),
            .terminated_sessions = std.array_list.Managed(*Session).init(allocator),
            .lock = .{},
            .next_client_id = 1,
            .backend_mode = backend_mode,
            .zmx_opts = zmx_opts,
            .token_policy = token_policy,
            .backend_factory = .{},
            .authorizer = .{},
            .share_issuer = .{},
        };
    }

    pub fn deinit(self: *SessionManager) void {
        var to_destroy = std.array_list.Managed(*Session).init(self.allocator);
        defer to_destroy.deinit();

        self.lock.lock();
        defer self.lock.unlock();

        var seen = std.AutoHashMap(usize, void).init(self.allocator);
        defer seen.deinit();

        var iter = self.sessions.iterator();
        while (iter.next()) |entry| {
            const session = entry.value_ptr.*;
            const key = @intFromPtr(session);
            if (!seen.contains(key)) {
                to_destroy.append(session) catch {};
                seen.put(key, {}) catch {};
            }
        }

        while (self.terminated_sessions.pop()) |session| {
            const key = @intFromPtr(session);
            if (!seen.contains(key)) {
                to_destroy.append(session) catch {};
                seen.put(key, {}) catch {};
            }
        }

        self.sessions.clearAndFree();
        self.terminated_sessions.clearRetainingCapacity();

        for (to_destroy.items) |session| {
            session.destroy();
        }
    }

    pub fn attach(
        self: *SessionManager,
        raw_session_id: []const u8,
        ws_fd: posix.fd_t,
        opts: SessionOptions,
    ) !SessionHandle {
        self.reapTerminated();

        if (!self.isAuthorized(raw_session_id, opts.token)) {
            return ManagerError.Unauthorized;
        }

        self.lock.lock();
        defer self.lock.unlock();

        const selected = if (self.sessions.get(raw_session_id)) |existing| blk: {
            if (!existing.isAlive()) {
                _ = self.sessions.fetchRemove(raw_session_id);
                self.terminated_sessions.append(existing) catch {
                    existing.destroy();
                    break :blk null;
                };
                break :blk null;
            }
            break :blk existing;
        } else null;

        const session = if (selected) |active| active else blk: {
            const session_id = try self.allocator.dupe(u8, raw_session_id);
            const created = try Session.init(self.allocator, self, session_id, opts);
            errdefer created.destroy();
            try created.startOutputPump();
            try self.sessions.put(session_id, created);
            break :blk created;
        };

        const client_id = self.next_client_id;
        self.next_client_id +%= 1;
        try session.addClient(ws_fd, client_id);

        return .{
            .session = session,
            .client_id = client_id,
            .manager = self,
        };
    }

    pub fn setBackendFactory(self: *SessionManager, factory: BackendFactory) void {
        self.backend_factory = factory;
    }

    pub fn setAuthorizer(self: *SessionManager, auth: Authorizer) void {
        self.authorizer = auth;
    }

    pub fn setShareIssuer(self: *SessionManager, issuer: ShareIssuer) void {
        self.share_issuer = issuer;
    }

    pub fn detach(self: *SessionManager, handle: *const SessionHandle) void {
        _ = self;
        _ = handle.session.removeClient(handle.client_id);
    }

    pub fn removeSession(self: *SessionManager, session_id: []const u8) void {
        self.lock.lock();
        const removed = if (self.sessions.fetchRemove(session_id)) |entry|
            entry.value
        else
            null;
        self.lock.unlock();

        if (removed) |session| {
            session.destroy();
        }
    }

    pub fn markTerminated(self: *SessionManager, session: *Session) void {
        self.lock.lock();
        if (!session.queued_for_cleanup) {
            _ = self.sessions.fetchRemove(session.id);
            self.terminated_sessions.append(session) catch {
                session.destroy();
                self.lock.unlock();
                return;
            };
            session.queued_for_cleanup = true;
        }
        self.lock.unlock();
    }

    fn isAuthorized(self: *SessionManager, session_id: []const u8, token: ?[]const u8) bool {
        if (self.authorizer.authorize_fn) |authorize| {
            return authorize(self.authorizer.context, session_id, token);
        }

        return switch (self.token_policy.mode) {
            .open => true,
            .global => blk: {
                const expected = self.token_policy.global_token orelse break :blk true;
                if (expected.len == 0) break :blk true;
                if (token == null or token.?.len == 0) break :blk false;
                break :blk std.mem.eql(u8, token.?, expected);
            },
            .session => blk: {
                const secret = self.token_policy.share_secret orelse break :blk false;
                if (secret.len == 0) break :blk false;
                if (token == null or token.?.len == 0) break :blk false;
                break :blk isValidSessionToken(session_id, token.?, secret);
            },
        };
    }

    pub fn tokenPolicyMode(self: *const SessionManager) TokenPolicyMode {
        return self.token_policy.mode;
    }

    pub fn sessionTokenRequired(self: *const SessionManager) bool {
        return switch (self.token_policy.mode) {
            .open => false,
            .global => self.token_policy.global_token != null and self.token_policy.global_token.?.len > 0,
            .session => self.token_policy.share_secret != null and self.token_policy.share_secret.?.len > 0,
        };
    }

    pub fn shareAuthority(self: *const SessionManager) ShareAuthority {
        if (self.share_issuer.issue_fn != null) return .host;
        return .server;
    }

    pub fn shareTokenTransport(self: *const SessionManager) ShareTokenTransport {
        if (!self.sessionTokenRequired()) return .none;
        return .query;
    }

    pub fn issueShareGrant(
        self: *const SessionManager,
        allocator: std.mem.Allocator,
        session_id: []const u8,
    ) !ShareGrant {
        if (self.share_issuer.issue_fn) |issue_fn| {
            return issue_fn(self.share_issuer.context, allocator, session_id);
        }

        return switch (self.token_policy.mode) {
            .open => ShareGrant{
                .token = null,
                .token_transport = .none,
                .authority = .server,
            },
            .global => blk: {
                const expected = self.token_policy.global_token orelse break :blk ShareGrant{
                    .token = null,
                    .token_transport = .none,
                    .authority = .server,
                };
                if (expected.len == 0) break :blk ShareGrant{
                    .token = null,
                    .token_transport = .none,
                    .authority = .server,
                };
                break :blk ShareGrant{
                    .token = try allocator.dupe(u8, expected),
                    .token_transport = .query,
                    .authority = .server,
                    .token_owned = true,
                };
            },
            .session => blk: {
                const secret = self.token_policy.share_secret orelse return error.ShareUnavailable;
                if (secret.len == 0) return error.ShareUnavailable;

                var token_buf: [HmacSha256.mac_length * 2]u8 = undefined;
                const token = try formatSessionTokenHex(session_id, secret, &token_buf);
                break :blk ShareGrant{
                    .token = try allocator.dupe(u8, token),
                    .token_transport = .query,
                    .authority = .server,
                    .token_owned = true,
                };
            },
        };
    }

    fn createBackend(
        self: *SessionManager,
        allocator: std.mem.Allocator,
        session_id: []const u8,
        opts: SessionOptions,
    ) !backends.BackendHandle {
        if (self.backend_factory.create_fn) |create_fn| {
            return try create_fn(
                self.backend_factory.context,
                allocator,
                self.backend_mode,
                session_id,
                opts,
                self.zmx_opts,
            );
        }

        return backends.createBackend(
            allocator,
            self.backend_mode,
            session_id,
            .{
                .cols = opts.cols,
                .rows = opts.rows,
                .command = opts.command,
            },
            self.zmx_opts,
        );
    }

    fn reapTerminated(self: *SessionManager) void {
        var reap = std.array_list.Managed(*Session).init(self.allocator);
        defer reap.deinit();

        self.lock.lock();
        while (self.terminated_sessions.pop()) |session| {
            reap.append(session) catch {};
        }
        self.lock.unlock();

        for (reap.items) |session| {
            session.destroy();
        }
    }
};

pub fn tokenPolicyLabel(mode: TokenPolicyMode) []const u8 {
    return switch (mode) {
        .open => "open",
        .global => "global",
        .session => "session",
    };
}

pub fn shareAuthorityLabel(authority: ShareAuthority) []const u8 {
    return switch (authority) {
        .server => "server",
        .host => "host",
    };
}

pub fn shareTokenTransportLabel(transport: ShareTokenTransport) []const u8 {
    return switch (transport) {
        .none => "none",
        .query => "query",
    };
}

pub fn formatSessionTokenHex(session_id: []const u8, secret: []const u8, out: []u8) ![]const u8 {
    if (out.len < HmacSha256.mac_length * 2) return error.NoSpaceLeft;

    var mac: [HmacSha256.mac_length]u8 = undefined;
    HmacSha256.create(mac[0..], session_id, secret);

    const hex = "0123456789abcdef";
    for (mac, 0..) |byte, i| {
        out[i * 2] = hex[byte >> 4];
        out[i * 2 + 1] = hex[byte & 0x0F];
    }
    return out[0 .. HmacSha256.mac_length * 2];
}

fn isValidSessionToken(session_id: []const u8, provided: []const u8, secret: []const u8) bool {
    var expected: [HmacSha256.mac_length * 2]u8 = undefined;
    const encoded = formatSessionTokenHex(session_id, secret, &expected) catch return false;
    if (provided.len != encoded.len) return false;
    return std.mem.eql(u8, provided, encoded);
}
