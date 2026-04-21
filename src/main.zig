const std = @import("std");
const posix = std.posix;
const base64 = std.base64;
const crypto = std.crypto;
const build_options = @import("build_options");
const parse_utils = @import("parse_utils.zig");
const EmbeddedAssets = struct {
    pub const has_embedded_assets = false;
    pub const WebAsset = struct {
        path: []const u8,
        data: []const u8,
        content_type: []const u8,
    };
    pub fn find(path: []const u8) ?WebAsset {
        _ = path;
        return null;
    }
};

const web_assets = if (build_options.embed_assets) @import("web_assets.zig") else EmbeddedAssets;
const ws = @import("ws_frames.zig");
const backends = @import("session_backends.zig");
const session_http = @import("session_http.zig");
const WorkbenchStore = @import("workbench_store.zig").WorkbenchStore;
const SessionManager = @import("session_manager.zig").SessionManager;
const TokenPolicy = @import("session_manager.zig").TokenPolicy;
const TokenPolicyMode = @import("session_manager.zig").TokenPolicyMode;
const ManagerError = @import("session_manager.zig").ManagerError;
const Session = @import("session_manager.zig").Session;
const writeAttachTraceFrame = @import("session_manager.zig").writeAttachTraceFrame;

const ServerConfig = struct {
    listen: []const u8 = "127.0.0.1:3000",
    web_root: []const u8 = "web/dist",
    sqlite_path: []const u8 = "supaterm-server.sqlite3",
    embed_assets: bool = build_options.embed_assets,
    backend: backends.BackendMode = .local,
    shell_startup: backends.LocalShellStartup = .fast,
    zmx_socket_dir: ?[]const u8 = null,
    zmx_session_prefix: []const u8 = "",
    zmx_binary: []const u8 = "zmx",
    zmx_spawn_retries: u16 = 160,
    zmx_spawn_wait_ms: u16 = 25,
    access_token: ?[]const u8 = null,
    share_token_secret: ?[]const u8 = null,
    token_policy: TokenPolicyMode = .open,
    enable_share_api: bool = false,
};

const ConnContext = struct {
    stream: std.net.Server.Connection,
    config: ServerConfig,
    manager: *SessionManager,
    workbench_store: *WorkbenchStore,
    allocator: std.mem.Allocator,
};

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{ .thread_safe = true }){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    const config = parseConfig(allocator) catch |err| {
        std.log.err("invalid arguments: {s}", .{@errorName(err)});
        return err;
    };

    const zmx_opts = backends.ZmxClientOptions{
        .socket_dir = config.zmx_socket_dir,
        .session_prefix = config.zmx_session_prefix,
        .binary = config.zmx_binary,
        .spawn_retries = config.zmx_spawn_retries,
        .spawn_wait_ms = config.zmx_spawn_wait_ms,
    };
    const token_policy = TokenPolicy{
        .mode = config.token_policy,
        .global_token = config.access_token,
        .share_secret = config.share_token_secret,
    };
    var manager = SessionManager.init(allocator, config.backend, config.shell_startup, zmx_opts, token_policy);
    defer manager.deinit();
    var workbench_store = WorkbenchStore.init(allocator, config.sqlite_path) catch |err| {
        std.log.err("failed to open sqlite store \"{s}\": {s}", .{ config.sqlite_path, @errorName(err) });
        return err;
    };
    defer workbench_store.deinit();

    const listen_addr = parseListenAddress(config.listen) catch |err| {
        std.log.err("invalid --listen value \"{s}\": {s}", .{ config.listen, @errorName(err) });
        return err;
    };

    var server = try listen_addr.listen(.{ .reuse_address = true });
    defer server.deinit();

    std.log.info("listening on {s}", .{config.listen});

    while (true) {
        const conn = server.accept() catch |err| {
            std.log.warn("accept failed err={s}", .{@errorName(err)});
            continue;
        };
        const ctx = ConnContext{
            .stream = conn,
            .config = config,
            .manager = &manager,
            .workbench_store = &workbench_store,
            .allocator = allocator,
        };

        const thread = std.Thread.spawn(.{}, handleConnection, .{ctx}) catch |err| {
            std.log.warn("spawn handler failed err={s}", .{@errorName(err)});
            conn.stream.close();
            continue;
        };
        thread.detach();
    }
}

fn parseConfig(allocator: std.mem.Allocator) !ServerConfig {
    var cfg = ServerConfig{};
    var token_policy_explicit = false;
    var args = try std.process.argsWithAllocator(allocator);
    defer args.deinit();

    while (args.next()) |arg| {
        if (std.mem.eql(u8, arg, "--help")) {
            printUsage();
            std.process.exit(0);
        }
        if (std.mem.eql(u8, arg, "--version")) {
            printVersion();
            std.process.exit(0);
        }
        if (std.mem.eql(u8, arg, "--embed-assets")) {
            cfg.embed_assets = true;
            continue;
        }
        if (std.mem.eql(u8, arg, "--enable-share-api")) {
            cfg.enable_share_api = true;
            continue;
        }

        if (std.mem.startsWith(u8, arg, "--listen=")) {
            cfg.listen = arg[9..];
            continue;
        }
        if (std.mem.startsWith(u8, arg, "--backend=")) {
            cfg.backend = try parseBackendMode(arg[10..]);
            continue;
        }
        if (std.mem.startsWith(u8, arg, "--sqlite-path=")) {
            cfg.sqlite_path = arg[14..];
            continue;
        }
        if (std.mem.startsWith(u8, arg, "--shell-startup=")) {
            cfg.shell_startup = try parseShellStartup(arg[16..]);
            continue;
        }
        if (std.mem.startsWith(u8, arg, "--zmx-socket-dir=")) {
            cfg.zmx_socket_dir = arg[16..];
            continue;
        }
        if (std.mem.startsWith(u8, arg, "--zmx-session-prefix=")) {
            cfg.zmx_session_prefix = arg[21..];
            continue;
        }
        if (std.mem.startsWith(u8, arg, "--zmx-binary=")) {
            cfg.zmx_binary = arg[13..];
            continue;
        }
        if (std.mem.startsWith(u8, arg, "--zmx-spawn-retries=")) {
            cfg.zmx_spawn_retries = parse_utils.parseU16(arg[20..]) orelse cfg.zmx_spawn_retries;
            continue;
        }
        if (std.mem.startsWith(u8, arg, "--zmx-spawn-wait-ms=")) {
            cfg.zmx_spawn_wait_ms = parse_utils.parseU16(arg[20..]) orelse cfg.zmx_spawn_wait_ms;
            continue;
        }
        if (std.mem.startsWith(u8, arg, "--access-token=")) {
            cfg.access_token = arg[14..];
            continue;
        }
        if (std.mem.startsWith(u8, arg, "--share-token-secret=")) {
            cfg.share_token_secret = arg[21..];
            continue;
        }
        if (std.mem.startsWith(u8, arg, "--token-policy=")) {
            cfg.token_policy = try parseTokenPolicyMode(arg[15..]);
            token_policy_explicit = true;
            continue;
        }
        if (std.mem.startsWith(u8, arg, "--web-root=")) {
            cfg.web_root = arg[11..];
            continue;
        }

        if (std.mem.eql(u8, arg, "--backend")) {
            const value = args.next() orelse return error.MissingBackendValue;
            cfg.backend = try parseBackendMode(value);
            continue;
        }
        if (std.mem.eql(u8, arg, "--sqlite-path")) {
            const value = args.next() orelse return error.MissingSqlitePathValue;
            cfg.sqlite_path = value;
            continue;
        }
        if (std.mem.eql(u8, arg, "--shell-startup")) {
            const value = args.next() orelse return error.MissingShellStartupValue;
            cfg.shell_startup = try parseShellStartup(value);
            continue;
        }
        if (std.mem.eql(u8, arg, "--zmx-socket-dir")) {
            if (args.next()) |value| cfg.zmx_socket_dir = value;
            continue;
        }
        if (std.mem.eql(u8, arg, "--zmx-session-prefix")) {
            if (args.next()) |value| cfg.zmx_session_prefix = value;
            continue;
        }
        if (std.mem.eql(u8, arg, "--zmx-binary")) {
            if (args.next()) |value| cfg.zmx_binary = value;
            continue;
        }
        if (std.mem.eql(u8, arg, "--zmx-spawn-retries")) {
            if (args.next()) |value| {
                cfg.zmx_spawn_retries = parse_utils.parseU16(value) orelse cfg.zmx_spawn_retries;
            }
            continue;
        }
        if (std.mem.eql(u8, arg, "--zmx-spawn-wait-ms")) {
            if (args.next()) |value| {
                cfg.zmx_spawn_wait_ms = parse_utils.parseU16(value) orelse cfg.zmx_spawn_wait_ms;
            }
            continue;
        }
        if (std.mem.eql(u8, arg, "--access-token")) {
            if (args.next()) |value| cfg.access_token = value;
            continue;
        }
        if (std.mem.eql(u8, arg, "--share-token-secret")) {
            if (args.next()) |value| cfg.share_token_secret = value;
            continue;
        }
        if (std.mem.eql(u8, arg, "--token-policy")) {
            const value = args.next() orelse return error.MissingTokenPolicyValue;
            cfg.token_policy = try parseTokenPolicyMode(value);
            token_policy_explicit = true;
            continue;
        }
        if (std.mem.eql(u8, arg, "--web-root")) {
            if (args.next()) |value| cfg.web_root = value;
            continue;
        }
        if (std.mem.eql(u8, arg, "--listen")) {
            if (args.next()) |value| cfg.listen = value;
            continue;
        }
    }

    if (cfg.access_token == null) {
        cfg.access_token = std.posix.getenv("SUPATERM_ACCESS_TOKEN");
    }
    if (cfg.share_token_secret == null) {
        cfg.share_token_secret = std.posix.getenv("SUPATERM_SHARE_TOKEN_SECRET");
    }
    if (std.mem.eql(u8, cfg.sqlite_path, "supaterm-server.sqlite3")) {
        if (std.posix.getenv("SUPATERM_SQLITE_PATH")) |env_value| {
            cfg.sqlite_path = env_value;
        }
    }

    if (!token_policy_explicit) {
        if (cfg.share_token_secret != null and cfg.share_token_secret.?.len > 0) {
            cfg.token_policy = .session;
        } else if (cfg.access_token != null and cfg.access_token.?.len > 0) {
            cfg.token_policy = .global;
        }
    }

    return cfg;
}

fn parseBackendMode(raw: []const u8) !backends.BackendMode {
    if (std.mem.eql(u8, raw, "local")) return .local;
    if (std.mem.eql(u8, raw, "zmx")) return .zmx;
    return error.InvalidBackendMode;
}

fn parseShellStartup(raw: []const u8) !backends.LocalShellStartup {
    if (std.mem.eql(u8, raw, "fast")) return .fast;
    if (std.mem.eql(u8, raw, "full")) return .full;
    return error.InvalidShellStartup;
}

fn parseTokenPolicyMode(raw: []const u8) !TokenPolicyMode {
    if (std.mem.eql(u8, raw, "open")) return .open;
    if (std.mem.eql(u8, raw, "global")) return .global;
    if (std.mem.eql(u8, raw, "session")) return .session;
    return error.InvalidTokenPolicy;
}

fn printUsage() void {
    std.log.info("supaterm-server", .{});
    std.log.info("  --listen <addr:port>            default: 127.0.0.1:3000", .{});
    std.log.info("  --backend <local|zmx>           default: local", .{});
    std.log.info("  --sqlite-path <path>            default: supaterm-server.sqlite3", .{});
    std.log.info("  --shell-startup <fast|full>     default: fast", .{});
    std.log.info("  --web-root <path>               default: web/dist", .{});
    std.log.info("  --embed-assets                  include embedded asset mode", .{});
    std.log.info("  --zmx-socket-dir <path>         base socket directory for zmx", .{});
    std.log.info("  --zmx-session-prefix <prefix>    session name prefix for zmx", .{});
    std.log.info("  --zmx-binary <path>             zmx executable path (default: zmx)", .{});
    std.log.info("  --zmx-spawn-retries <n>         zmx bootstrap retry count (default: 160)", .{});
    std.log.info("  --zmx-spawn-wait-ms <n>         retry sleep in ms (default: 25)", .{});
    std.log.info("  --token-policy <open|global|session>  default: auto(open/global/session)", .{});
    std.log.info("  --access-token <token>          shared token when token-policy=global", .{});
    std.log.info("  --share-token-secret <secret>   HMAC secret when token-policy=session", .{});
    std.log.info("  --enable-share-api              expose /api/sessions/{{id}}/share for explicit token issuance", .{});
}

fn printVersion() void {
    std.log.info("supaterm-server {s}", .{build_options.app_version});
}

fn parseListenAddress(raw: []const u8) !std.net.Address {
    const idx = std.mem.lastIndexOfScalar(u8, raw, ':') orelse return error.InvalidAddress;
    const host = raw[0..idx];
    const port_raw = raw[idx + 1 ..];
    if (port_raw.len == 0) return error.InvalidAddress;

    const port = try std.fmt.parseInt(u16, port_raw, 10);

    const normalized_host = if (std.mem.eql(u8, host, "localhost"))
        "127.0.0.1"
    else if (std.mem.eql(u8, host, "*"))
        "0.0.0.0"
    else
        host;

    if (std.net.Address.parseIp(normalized_host, port)) |addr| {
        return addr;
    } else |_| {}

    if (std.net.Address.parseIp6(normalized_host, port)) |addr6| {
        return addr6;
    } else |_| {
        return error.InvalidAddress;
    }
}

fn handleConnection(ctx: ConnContext) void {
    var close_stream = true;
    defer if (close_stream) ctx.stream.stream.close();

    var read_buffer: [4096]u8 = undefined;
    var write_buffer: [4096]u8 = undefined;
    var reader = ctx.stream.stream.reader(&read_buffer);
    var writer = ctx.stream.stream.writer(&write_buffer);
    const io_writer = &writer.interface;

    const request_line = readTrimmedLine(&reader, ctx.allocator) catch return;
    defer ctx.allocator.free(request_line);
    if (request_line.len == 0) return;

    var iter = std.mem.tokenizeAny(u8, request_line, " ");
    const method = iter.next() orelse return;
    const target = iter.next() orelse return;
    _ = iter.next(); // HTTP version

    const query_start = std.mem.indexOfScalar(u8, target, '?');
    const request_path = if (query_start) |i| target[0..i] else target;
    const query = if (query_start) |i| target[i + 1 ..] else "";
    var headers = readRequestHeaders(&reader, ctx.allocator) catch return;
    defer headers.deinit(ctx.allocator);

    if (session_http.extractWorkbenchId(request_path)) |raw_workbench_id| {
        const workbench_id = session_http.canonicalizeSessionId(ctx.allocator, raw_workbench_id) catch {
            writeStatus(io_writer, 400, "Bad Request", "text/plain", "Invalid workbench id") catch {};
            io_writer.flush() catch {};
            return;
        };
        defer ctx.allocator.free(workbench_id);

        const request_token = headers.bearer_token orelse session_http.parseSessionOptions(query).token;
        if (!ctx.manager.authorize(workbench_id, request_token)) {
            writeStatus(io_writer, 403, "Forbidden", "text/plain", "Unauthorized") catch {};
            io_writer.flush() catch {};
            return;
        }

        if (std.mem.eql(u8, method, "GET")) {
            var snapshot = ctx.workbench_store.loadSnapshot(ctx.allocator, workbench_id) catch {
                writeStatus(io_writer, 500, "Server Error", "text/plain", "Failed to load workbench snapshot") catch {};
                io_writer.flush() catch {};
                return;
            };
            if (snapshot == null) {
                writeStatus(io_writer, 404, "Not Found", "text/plain", "Not found") catch {};
                io_writer.flush() catch {};
                return;
            }
            defer snapshot.?.deinit(ctx.allocator);

            var payload = session_http.WorkbenchSnapshotPayload.init(
                ctx.allocator,
                workbench_id,
                snapshot.?.updated_at_unix_ms,
                snapshot.?.state_json,
            ) catch {
                writeStatus(io_writer, 500, "Server Error", "text/plain", "Failed to build workbench snapshot") catch {};
                io_writer.flush() catch {};
                return;
            };
            defer payload.deinit(ctx.allocator);

            const body = payload.toJson(ctx.allocator) catch {
                writeStatus(io_writer, 500, "Server Error", "text/plain", "Failed to serialize workbench snapshot") catch {};
                io_writer.flush() catch {};
                return;
            };
            defer ctx.allocator.free(body);

            writeStatus(io_writer, 200, "OK", "application/json", body) catch {};
            io_writer.flush() catch {};
            return;
        }

        if (std.mem.eql(u8, method, "PUT")) {
            if (headers.invalid_content_length or headers.content_length == null) {
                writeStatus(io_writer, 411, "Length Required", "text/plain", "Missing Content-Length") catch {};
                io_writer.flush() catch {};
                return;
            }
            if (headers.content_length.? > 512 * 1024) {
                writeStatus(io_writer, 413, "Payload Too Large", "text/plain", "Payload too large") catch {};
                io_writer.flush() catch {};
                return;
            }

            const body = readRequestBody(&reader, ctx.allocator, headers.content_length.?) catch {
                writeStatus(io_writer, 400, "Bad Request", "text/plain", "Invalid request body") catch {};
                io_writer.flush() catch {};
                return;
            };
            defer ctx.allocator.free(body);

            var parsed = std.json.parseFromSlice(std.json.Value, ctx.allocator, body, .{}) catch {
                writeStatus(io_writer, 400, "Bad Request", "text/plain", "Invalid JSON body") catch {};
                io_writer.flush() catch {};
                return;
            };
            defer parsed.deinit();
            if (parsed.value != .object) {
                writeStatus(io_writer, 400, "Bad Request", "text/plain", "Workbench snapshot must be a JSON object") catch {};
                io_writer.flush() catch {};
                return;
            }

            _ = ctx.workbench_store.saveSnapshot(workbench_id, body) catch {
                writeStatus(io_writer, 500, "Server Error", "text/plain", "Failed to save workbench snapshot") catch {};
                io_writer.flush() catch {};
                return;
            };

            writeStatus(io_writer, 204, "No Content", "text/plain", "") catch {};
            io_writer.flush() catch {};
            return;
        }

        writeStatus(io_writer, 405, "Method Not Allowed", "text/plain", "Method Not Allowed") catch {};
        io_writer.flush() catch {};
        return;
    }

    if (!std.mem.eql(u8, method, "GET")) {
        writeStatus(io_writer, 405, "Method Not Allowed", "text/plain", "Method Not Allowed") catch {};
        io_writer.flush() catch {};
        return;
    }

    if (std.mem.eql(u8, request_path, "/health")) {
        writeStatus(
            io_writer,
            200,
            "OK",
            "application/json",
            "{\"status\":\"ok\",\"service\":\"supaterm-server\"}",
        ) catch {};
        io_writer.flush() catch {};
        return;
    }

    if (std.mem.eql(u8, request_path, "/api/capabilities/shells")) {
        var availability = backends.collectShellAvailability(ctx.allocator) catch {
            writeStatus(io_writer, 500, "Server Error", "text/plain", "Failed to detect shell capabilities") catch {};
            io_writer.flush() catch {};
            return;
        };
        defer backends.deinitShellAvailability(ctx.allocator, &availability);

        const payload = session_http.ShellCapabilitiesPayload{
            .default_shell = backends.detectDefaultShellKind(),
            .availability = availability,
        };
        const body = payload.toJson(ctx.allocator) catch {
            writeStatus(io_writer, 500, "Server Error", "text/plain", "Failed to serialize shell capabilities") catch {};
            io_writer.flush() catch {};
            return;
        };
        defer ctx.allocator.free(body);

        writeStatus(io_writer, 200, "OK", "application/json", body) catch {};
        io_writer.flush() catch {};
        return;
    }

    if (session_http.extractSessionShareId(request_path)) |raw_session_id| {
        if (!ctx.config.enable_share_api) {
            writeStatus(io_writer, 404, "Not Found", "text/plain", "Not found") catch {};
            io_writer.flush() catch {};
            return;
        }

        const session_id = session_http.canonicalizeSessionId(ctx.allocator, raw_session_id) catch {
            writeStatus(io_writer, 400, "Bad Request", "text/plain", "Invalid session id") catch {};
            io_writer.flush() catch {};
            return;
        };
        defer ctx.allocator.free(session_id);

        var grant = ctx.manager.issueShareGrant(ctx.allocator, session_id) catch |err| {
            switch (err) {
                error.OutOfMemory => {
                    writeStatus(io_writer, 500, "Server Error", "text/plain", "Out of memory") catch {};
                },
                error.ShareUnavailable => {
                    writeStatus(io_writer, 503, "Service Unavailable", "text/plain", "Share unavailable") catch {};
                },
                else => {
                    writeStatus(io_writer, 500, "Server Error", "text/plain", "Failed to issue share grant") catch {};
                },
            }
            io_writer.flush() catch {};
            return;
        };
        defer grant.deinit(ctx.allocator);

        var payload = session_http.ShareGrantPayload.init(ctx.allocator, session_id, grant) catch {
            writeStatus(io_writer, 500, "Server Error", "text/plain", "Failed to build share grant") catch {};
            io_writer.flush() catch {};
            return;
        };
        defer payload.deinit(ctx.allocator);

        const body = payload.toJson(ctx.allocator) catch {
            writeStatus(io_writer, 500, "Server Error", "text/plain", "Failed to build share grant") catch {};
            io_writer.flush() catch {};
            return;
        };
        defer ctx.allocator.free(body);

        writeStatus(io_writer, 200, "OK", "application/json", body) catch {};
        io_writer.flush() catch {};
        return;
    }

    if (session_http.extractSessionMetaId(request_path)) |raw_session_id| {
        const session_id = session_http.canonicalizeSessionId(ctx.allocator, raw_session_id) catch {
            writeStatus(io_writer, 400, "Bad Request", "text/plain", "Invalid session id") catch {};
            io_writer.flush() catch {};
            return;
        };
        defer ctx.allocator.free(session_id);

        var payload = session_http.SessionAccessPayload.init(
            ctx.allocator,
            ctx.manager,
            session_id,
            ctx.config.enable_share_api,
        ) catch {
            writeStatus(io_writer, 500, "Server Error", "text/plain", "Failed to build session metadata") catch {};
            io_writer.flush() catch {};
            return;
        };
        defer payload.deinit(ctx.allocator);

        const body = payload.toJson(ctx.allocator) catch {
            writeStatus(io_writer, 500, "Server Error", "text/plain", "Failed to build session metadata") catch {};
            io_writer.flush() catch {};
            return;
        };
        defer ctx.allocator.free(body);

        writeStatus(io_writer, 200, "OK", "application/json", body) catch {};
        io_writer.flush() catch {};
        return;
    }

    if (session_http.extractSessionWsId(request_path)) |raw_session_id| {
        const session_id = session_http.canonicalizeSessionId(ctx.allocator, raw_session_id) catch {
            writeStatus(io_writer, 400, "Bad Request", "text/plain", "Invalid session id") catch {};
            io_writer.flush() catch {};
            return;
        };
        defer ctx.allocator.free(session_id);

        if (!(headers.upgrade_websocket and headers.connection_upgrade)) {
            writeStatus(io_writer, 400, "Bad Request", "text/plain", "Expected websocket upgrade") catch {};
            io_writer.flush() catch {};
            return;
        }

        const key = headers.sec_websocket_key orelse {
            writeStatus(io_writer, 400, "Bad Request", "text/plain", "Missing Sec-WebSocket-Key") catch {};
            io_writer.flush() catch {};
            return;
        };
        const opts = session_http.parseSessionOptions(query);
        var handle = ctx.manager.attach(session_id, ctx.stream.stream.handle, opts) catch |err| {
            switch (err) {
                ManagerError.Unauthorized => {
                    writeStatus(io_writer, 403, "Forbidden", "text/plain", "Unauthorized") catch {};
                },
                backends.BackendError.ShellUnavailable => {
                    writeStatus(io_writer, 400, "Bad Request", "text/plain", "Requested shell unavailable") catch {};
                },
                error.OutOfMemory => {
                    writeStatus(io_writer, 500, "Server Error", "text/plain", "Out of memory") catch {};
                },
                else => {
                    writeStatus(io_writer, 503, "Service Unavailable", "text/plain", "Session unavailable") catch {};
                },
            }
            io_writer.flush() catch {};
            return;
        };
        defer handle.deinit();

        const accept = computeWsAccept(ctx.allocator, key) catch return;
        defer ctx.allocator.free(accept);

        writeWsHandshake(io_writer, accept) catch {};
        io_writer.flush() catch {};
        writeAttachTraceFrame(ctx.stream.stream.handle, handle.attach_trace) catch {};

        close_stream = false;
        websocketLoop(ctx.allocator, handle.session, ctx.stream.stream.handle) catch {};
        return;
    }

    serveStatic(ctx.allocator, io_writer, ctx.config, request_path) catch {};
    io_writer.flush() catch {};
}

const Header = struct { name: []const u8, value: []const u8 };

const RequestHeaders = struct {
    upgrade_websocket: bool = false,
    connection_upgrade: bool = false,
    sec_websocket_key: ?[]u8 = null,
    content_length: ?usize = null,
    invalid_content_length: bool = false,
    bearer_token: ?[]u8 = null,

    pub fn deinit(self: *RequestHeaders, allocator: std.mem.Allocator) void {
        if (self.sec_websocket_key) |value| allocator.free(value);
        if (self.bearer_token) |value| allocator.free(value);
        self.* = undefined;
    }
};

fn parseHeader(line: []const u8) ?Header {
    const idx = std.mem.indexOfScalar(u8, line, ':') orelse return null;
    const name = std.mem.trim(u8, line[0..idx], " \t\r\n");
    const value = std.mem.trim(u8, line[idx + 1 ..], " \t\r\n");
    if (name.len == 0 or value.len == 0) return null;
    return .{ .name = name, .value = value };
}

fn readRequestHeaders(reader: anytype, allocator: std.mem.Allocator) !RequestHeaders {
    var headers = RequestHeaders{};
    errdefer headers.deinit(allocator);

    while (true) {
        const line = try readTrimmedLine(reader, allocator);
        defer allocator.free(line);
        if (line.len == 0) break;

        const parsed = parseHeader(line) orelse continue;
        if (ieq(parsed.name, "Upgrade")) {
            headers.upgrade_websocket = containsTokenCaseInsensitive(parsed.value, "websocket");
        } else if (ieq(parsed.name, "Connection")) {
            headers.connection_upgrade = containsTokenCaseInsensitive(parsed.value, "Upgrade");
        } else if (ieq(parsed.name, "Sec-WebSocket-Key")) {
            if (headers.sec_websocket_key) |value| allocator.free(value);
            headers.sec_websocket_key = try allocator.dupe(u8, parsed.value);
        } else if (ieq(parsed.name, "Content-Length")) {
            headers.content_length = std.fmt.parseInt(usize, parsed.value, 10) catch blk: {
                headers.invalid_content_length = true;
                break :blk null;
            };
        } else if (ieq(parsed.name, "Authorization")) {
            if (parseBearerToken(parsed.value)) |token| {
                if (headers.bearer_token) |value| allocator.free(value);
                headers.bearer_token = try allocator.dupe(u8, token);
            }
        }
    }

    return headers;
}

fn parseBearerToken(value: []const u8) ?[]const u8 {
    if (value.len < 7) return null;
    if (!std.ascii.eqlIgnoreCase(value[0..6], "Bearer")) return null;
    if (value[6] != ' ') return null;
    const token = std.mem.trim(u8, value[7..], " \t\r\n");
    if (token.len == 0) return null;
    return token;
}

fn readTrimmedLine(reader: anytype, allocator: std.mem.Allocator) ![]u8 {
    const raw = (reader.interface().takeDelimiter('\n') catch return error.EndOfStream) orelse return error.EndOfStream;
    const trimmed = std.mem.trimRight(u8, raw, "\r\n");
    const copied = try allocator.dupe(u8, trimmed);
    return copied;
}

fn readRequestBody(reader: anytype, allocator: std.mem.Allocator, content_length: usize) ![]u8 {
    const body = try allocator.alloc(u8, content_length);
    errdefer allocator.free(body);
    var filled: usize = 0;
    while (filled < body.len) {
        const amount = try reader.interface().readSliceShort(body[filled..]);
        if (amount == 0) return error.EndOfStream;
        filled += amount;
    }
    return body;
}

fn writeStatus(
    writer: anytype,
    status: u16,
    reason: []const u8,
    content_type: []const u8,
    body: []const u8,
) !void {
    try writer.print("HTTP/1.1 {d} {s}\r\n", .{ status, reason });
    try writer.print("Content-Type: {s}\r\n", .{content_type});
    try writer.print("Content-Length: {d}\r\n", .{body.len});
    try writer.print("Connection: close\r\n", .{});
    try writer.print("\r\n", .{});
    try writer.writeAll(body);
}

fn writeWsHandshake(writer: anytype, accept_key: []const u8) !void {
    try writer.print("HTTP/1.1 101 Switching Protocols\r\n", .{});
    try writer.print("Upgrade: websocket\r\n", .{});
    try writer.print("Connection: Upgrade\r\n", .{});
    try writer.print("Sec-WebSocket-Accept: {s}\r\n", .{accept_key});
    try writer.print("\r\n", .{});
}

fn serveStatic(
    allocator: std.mem.Allocator,
    writer: anytype,
    config: ServerConfig,
    request_path: []const u8,
) !void {
    if (config.embed_assets and web_assets.has_embedded_assets) {
        if (try serveEmbedded(writer, request_path)) return;
    }

    if (std.mem.indexOf(u8, request_path, "..") != null) {
        try writeStatus(writer, 403, "Forbidden", "text/plain", "Forbidden");
        try writer.flush();
        return;
    }

    const rel = if (std.mem.eql(u8, request_path, "/"))
        "index.html"
    else
        request_path[1..];

    const full_path = try std.fs.path.join(allocator, &[_][]const u8{ config.web_root, rel });
    defer allocator.free(full_path);

    const file = std.fs.cwd().openFile(full_path, .{}) catch |err| {
        if (err == error.FileNotFound) {
            try writeStatus(writer, 404, "Not Found", "text/plain", "Not found");
            return;
        }
        try writeStatus(writer, 500, "Server Error", "text/plain", "Failed to open file");
        return;
    };
    defer file.close();

    const len = try file.getEndPos();
    const ctype = detectContentType(full_path);

    try writer.print("HTTP/1.1 200 OK\r\n", .{});
    try writer.print("Content-Type: {s}\r\n", .{ctype});
    try writer.print("Content-Length: {d}\r\n", .{len});
    try writer.print("Connection: close\r\n\r\n", .{});

    var buf: [8192]u8 = undefined;
    var total_written: u64 = 0;
    while (total_written < len) {
        const read_len = try file.read(&buf);
        if (read_len == 0) break;
        try writer.writeAll(buf[0..read_len]);
        total_written += read_len;
    }
    try writer.flush();
}

fn serveEmbedded(
    writer: anytype,
    request_path: []const u8,
) !bool {
    const rel = if (std.mem.eql(u8, request_path, "/"))
        "index.html"
    else if (request_path.len > 0 and request_path[0] == '/')
        request_path[1..]
    else
        request_path;

    const asset = web_assets.find(rel) orelse return false;

    try writeStatus(writer, 200, "OK", asset.content_type, asset.data);
    try writer.flush();
    return true;
}

fn detectContentType(path: []const u8) []const u8 {
    if (std.mem.endsWith(u8, path, ".html")) return "text/html; charset=utf-8";
    if (std.mem.endsWith(u8, path, ".js")) return "text/javascript; charset=utf-8";
    if (std.mem.endsWith(u8, path, ".css")) return "text/css; charset=utf-8";
    if (std.mem.endsWith(u8, path, ".svg")) return "image/svg+xml";
    if (std.mem.endsWith(u8, path, ".json")) return "application/json";
    if (std.mem.endsWith(u8, path, ".wasm")) return "application/wasm";
    if (std.mem.endsWith(u8, path, ".png")) return "image/png";
    return "application/octet-stream";
}

fn websocketLoop(allocator: std.mem.Allocator, session: *Session, fd: posix.fd_t) !void {
    var is_open = true;
    defer if (is_open) ws.writeFrame(fd, .close, "") catch {};

    while (true) {
        const frame = ws.readFrame(allocator, fd) catch return;
        if (frame == null) return;

        const parsed = frame.?;
        defer allocator.free(parsed.payload);

        switch (parsed.opcode) {
            .binary => {
                if (parsed.payload.len == 0) continue;
                session.writeInput(parsed.payload) catch {};
            },
            .text => {
                if (parsed.payload.len == 0) continue;
                if (session_http.parseResizeFrame(parsed.payload)) |rc| {
                    session.resize(rc.cols, rc.rows) catch {};
                } else {
                    session.writeInput(parsed.payload) catch {};
                }
            },
            .close => {
                is_open = false;
                return;
            },
            .ping => {
                ws.writeFrame(fd, .pong, parsed.payload) catch {};
            },
            else => continue,
        }
    }
}

fn ieq(a: []const u8, b: []const u8) bool {
    if (a.len != b.len) return false;
    for (a, 0..) |ch, i| {
        if (std.ascii.toLower(ch) != std.ascii.toLower(b[i])) {
            return false;
        }
    }
    return true;
}

fn containsTokenCaseInsensitive(value: []const u8, token: []const u8) bool {
    var it = std.mem.splitAny(u8, value, ",");
    while (it.next()) |piece| {
        const trimmed = std.mem.trim(u8, piece, " \t");
        if (ieq(trimmed, token)) return true;
    }
    return false;
}

fn computeWsAccept(allocator: std.mem.Allocator, key: []const u8) ![]u8 {
    const magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    var hasher = crypto.hash.Sha1.init(.{});
    hasher.update(key);
    hasher.update(magic);
    var digest: [20]u8 = undefined;
    hasher.final(&digest);

    const enc = base64.standard.Encoder;
    const len = enc.calcSize(digest.len);
    const encoded = try allocator.alloc(u8, len);
    _ = enc.encode(encoded, &digest);
    return encoded;
}
