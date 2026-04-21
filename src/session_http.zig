const std = @import("std");
const SessionManager = @import("session_manager.zig").SessionManager;
const SessionOptions = @import("session_manager.zig").SessionOptions;
const ShareGrant = @import("session_manager.zig").ShareGrant;
const backends = @import("session_backends.zig");
const parse_utils = @import("parse_utils.zig");
const tokenPolicyLabel = @import("session_manager.zig").tokenPolicyLabel;
const shareAuthorityLabel = @import("session_manager.zig").shareAuthorityLabel;
const shareTokenTransportLabel = @import("session_manager.zig").shareTokenTransportLabel;

pub const SessionAccessPayload = struct {
    session_id: []const u8,
    token_policy: []const u8,
    token_required: bool,
    websocket_path: []const u8,
    share_authority: []const u8,
    share_token_transport: []const u8,
    share_api_enabled: bool,
    share_api_path: []const u8,

    pub fn init(
        allocator: std.mem.Allocator,
        manager: *const SessionManager,
        session_id: []const u8,
        share_api_enabled: bool,
    ) !SessionAccessPayload {
        const websocket_path = try std.fmt.allocPrint(allocator, "/api/sessions/{s}/ws", .{session_id});
        errdefer allocator.free(websocket_path);
        const share_api_path = try std.fmt.allocPrint(allocator, "/api/sessions/{s}/share", .{session_id});
        errdefer allocator.free(share_api_path);

        return .{
            .session_id = try allocator.dupe(u8, session_id),
            .token_policy = tokenPolicyLabel(manager.tokenPolicyMode()),
            .token_required = manager.sessionTokenRequired(),
            .websocket_path = websocket_path,
            .share_authority = shareAuthorityLabel(manager.shareAuthority()),
            .share_token_transport = shareTokenTransportLabel(manager.shareTokenTransport()),
            .share_api_enabled = share_api_enabled,
            .share_api_path = share_api_path,
        };
    }

    pub fn deinit(self: *SessionAccessPayload, allocator: std.mem.Allocator) void {
        allocator.free(self.session_id);
        allocator.free(self.websocket_path);
        allocator.free(self.share_api_path);
        self.* = undefined;
    }

    pub fn toJson(self: SessionAccessPayload, allocator: std.mem.Allocator) ![]u8 {
        return std.fmt.allocPrint(
            allocator,
            "{{\"session_id\":\"{s}\",\"token_policy\":\"{s}\",\"token_required\":{s},\"websocket_path\":\"{s}\",\"share_authority\":\"{s}\",\"share_token_transport\":\"{s}\",\"share_api_enabled\":{s},\"share_api_path\":\"{s}\"}}",
            .{
                self.session_id,
                self.token_policy,
                if (self.token_required) "true" else "false",
                self.websocket_path,
                self.share_authority,
                self.share_token_transport,
                if (self.share_api_enabled) "true" else "false",
                self.share_api_path,
            },
        );
    }
};

pub const ShareGrantPayload = struct {
    session_id: []const u8,
    websocket_path: []const u8,
    token: ?[]const u8,
    token_transport: []const u8,
    share_authority: []const u8,
    expires_at_unix_ms: ?i64,

    pub fn init(
        allocator: std.mem.Allocator,
        session_id: []const u8,
        grant: ShareGrant,
    ) !ShareGrantPayload {
        return .{
            .session_id = try allocator.dupe(u8, session_id),
            .websocket_path = try std.fmt.allocPrint(allocator, "/api/sessions/{s}/ws", .{session_id}),
            .token = if (grant.token) |token| try allocator.dupe(u8, token) else null,
            .token_transport = shareTokenTransportLabel(grant.token_transport),
            .share_authority = shareAuthorityLabel(grant.authority),
            .expires_at_unix_ms = grant.expires_at_unix_ms,
        };
    }

    pub fn deinit(self: *ShareGrantPayload, allocator: std.mem.Allocator) void {
        allocator.free(self.session_id);
        allocator.free(self.websocket_path);
        if (self.token) |token| allocator.free(token);
        self.* = undefined;
    }

    pub fn toJson(self: ShareGrantPayload, allocator: std.mem.Allocator) ![]u8 {
        if (self.expires_at_unix_ms) |expires_at_unix_ms| {
            return std.fmt.allocPrint(
                allocator,
                "{{\"session_id\":\"{s}\",\"websocket_path\":\"{s}\",\"token\":\"{s}\",\"token_transport\":\"{s}\",\"share_authority\":\"{s}\",\"expires_at_unix_ms\":{d}}}",
                .{
                    self.session_id,
                    self.websocket_path,
                    self.token orelse "",
                    self.token_transport,
                    self.share_authority,
                    expires_at_unix_ms,
                },
            );
        }

        return std.fmt.allocPrint(
            allocator,
            "{{\"session_id\":\"{s}\",\"websocket_path\":\"{s}\",\"token\":\"{s}\",\"token_transport\":\"{s}\",\"share_authority\":\"{s}\",\"expires_at_unix_ms\":null}}",
            .{
                self.session_id,
                self.websocket_path,
                self.token orelse "",
                self.token_transport,
                self.share_authority,
            },
        );
    }
};

pub const WorkbenchSnapshotPayload = struct {
    workbench_id: []const u8,
    updated_at_unix_ms: i64,
    state_json: []const u8,

    pub fn init(
        allocator: std.mem.Allocator,
        workbench_id: []const u8,
        updated_at_unix_ms: i64,
        state_json: []const u8,
    ) !WorkbenchSnapshotPayload {
        return .{
            .workbench_id = try allocator.dupe(u8, workbench_id),
            .updated_at_unix_ms = updated_at_unix_ms,
            .state_json = try allocator.dupe(u8, state_json),
        };
    }

    pub fn deinit(self: *WorkbenchSnapshotPayload, allocator: std.mem.Allocator) void {
        allocator.free(self.workbench_id);
        allocator.free(self.state_json);
        self.* = undefined;
    }

    pub fn toJson(self: WorkbenchSnapshotPayload, allocator: std.mem.Allocator) ![]u8 {
        return std.fmt.allocPrint(
            allocator,
            "{{\"workbench_id\":\"{s}\",\"updated_at_unix_ms\":{d},\"state\":{s}}}",
            .{
                self.workbench_id,
                self.updated_at_unix_ms,
                self.state_json,
            },
        );
    }
};

pub const ShellCapabilitiesPayload = struct {
    default_shell: ?backends.ShellKind,
    availability: [4]backends.ShellAvailability,

    pub fn toJson(self: ShellCapabilitiesPayload, allocator: std.mem.Allocator) ![]u8 {
        var body = std.array_list.Managed(u8).init(allocator);
        errdefer body.deinit();
        const writer = body.writer();

        try writer.writeAll("{\"default_shell\":");
        if (self.default_shell) |shell| {
            try writer.print("{f}", .{std.json.fmt(backends.shellKindLabel(shell), .{})});
        } else {
            try writer.writeAll("null");
        }
        try writer.writeAll(",\"shells\":[");
        for (self.availability, 0..) |entry, index| {
            if (index > 0) try writer.writeByte(',');
            try writer.writeAll("{\"id\":");
            try writer.print("{f}", .{std.json.fmt(backends.shellKindLabel(entry.kind), .{})});
            try writer.writeAll(",\"available\":");
            try writer.writeAll(if (entry.isAvailable()) "true" else "false");
            try writer.writeAll(",\"path\":");
            if (entry.path) |path| {
                try writer.print("{f}", .{std.json.fmt(path, .{})});
            } else {
                try writer.writeAll("null");
            }
            try writer.writeByte('}');
        }
        try writer.writeAll("]}");
        return body.toOwnedSlice();
    }
};

pub fn extractSessionWsId(path: []const u8) ?[]const u8 {
    if (std.mem.eql(u8, path, "/ws")) return "default";
    const prefix = "/api/sessions/";
    if (!std.mem.startsWith(u8, path, prefix)) return null;
    if (!std.mem.endsWith(u8, path, "/ws")) return null;
    const start = prefix.len;
    const end = path.len - 3;
    if (start >= end) return "default";
    return path[start..end];
}

pub fn extractSessionMetaId(path: []const u8) ?[]const u8 {
    const prefix = "/api/sessions/";
    if (!std.mem.startsWith(u8, path, prefix)) return null;
    if (std.mem.endsWith(u8, path, "/ws")) return null;
    if (std.mem.endsWith(u8, path, "/share")) return null;
    const raw = path[prefix.len..];
    if (raw.len == 0) return "default";
    return raw;
}

pub fn extractSessionShareId(path: []const u8) ?[]const u8 {
    const prefix = "/api/sessions/";
    if (!std.mem.startsWith(u8, path, prefix)) return null;
    if (!std.mem.endsWith(u8, path, "/share")) return null;
    const start = prefix.len;
    const end = path.len - "/share".len;
    if (start >= end) return "default";
    return path[start..end];
}

pub fn extractWorkbenchId(path: []const u8) ?[]const u8 {
    const prefix = "/api/workbench/";
    if (!std.mem.startsWith(u8, path, prefix)) return null;
    const raw = path[prefix.len..];
    if (raw.len == 0) return "default";
    return raw;
}

pub fn canonicalizeSessionId(allocator: std.mem.Allocator, raw: []const u8) ![]u8 {
    const source = if (raw.len == 0) "default" else raw;
    var decoded = try allocator.alloc(u8, source.len);
    defer allocator.free(decoded);

    var in_i: usize = 0;
    var out_i: usize = 0;
    while (in_i < source.len) : (in_i += 1) {
        var ch = source[in_i];
        if (ch == '%') {
            if (in_i + 2 >= source.len) return error.InvalidSessionId;
            const hi = std.fmt.charToDigit(source[in_i + 1], 16) catch return error.InvalidSessionId;
            const lo = std.fmt.charToDigit(source[in_i + 2], 16) catch return error.InvalidSessionId;
            ch = @as(u8, @intCast((hi << 4) | lo));
            in_i += 2;
        }

        if (!isValidSessionIdChar(ch)) return error.InvalidSessionId;
        decoded[out_i] = ch;
        out_i += 1;
    }

    if (out_i == 0 or out_i > 128) return error.InvalidSessionId;
    return allocator.dupe(u8, decoded[0..out_i]);
}

pub fn parseSessionOptions(raw_query: []const u8) SessionOptions {
    var opts = SessionOptions{};
    if (raw_query.len == 0) return opts;

    var it = std.mem.tokenizeAny(u8, raw_query, "&");
    while (it.next()) |pair| {
        if (pair.len == 0) continue;
        var kv = std.mem.tokenizeAny(u8, pair, "=");
        const k = kv.next() orelse continue;
        const v = kv.next() orelse "";

        if (std.mem.eql(u8, k, "cols")) {
            if (parse_utils.parseU16(v)) |parsed| opts.cols = parsed;
        } else if (std.mem.eql(u8, k, "rows")) {
            if (parse_utils.parseU16(v)) |parsed| opts.rows = parsed;
        } else if (std.mem.eql(u8, k, "command")) {
            if (v.len > 0) opts.command = v;
        } else if (std.mem.eql(u8, k, "shell")) {
            if (backends.parseShellKind(v)) |shell| opts.shell = shell;
        } else if (std.mem.eql(u8, k, "token")) {
            if (v.len > 0) opts.token = v;
        }
    }

    return opts;
}

pub const Resize = struct { cols: u16, rows: u16 };

pub fn parseResizeFrame(payload: []const u8) ?Resize {
    if (std.mem.indexOf(u8, payload, "\"type\"") == null) return null;
    if (std.mem.indexOf(u8, payload, "\"resize\"") == null) return null;
    const cols = parseNumericField(payload, "cols") orelse return null;
    const rows = parseNumericField(payload, "rows") orelse return null;
    return .{ .cols = cols, .rows = rows };
}

fn parseNumericField(payload: []const u8, name: []const u8) ?u16 {
    const needle = if (std.mem.eql(u8, name, "cols")) "\"cols\":" else if (std.mem.eql(u8, name, "rows")) "\"rows\":" else return null;
    const idx = std.mem.indexOf(u8, payload, needle) orelse return null;
    var i = idx + needle.len;
    while (i < payload.len and (payload[i] == ' ' or payload[i] == ':' or payload[i] == '\"' or payload[i] == ',')) {
        i += 1;
    }
    if (i >= payload.len or payload[i] < '0' or payload[i] > '9') return null;
    const start = i;
    while (i < payload.len and payload[i] >= '0' and payload[i] <= '9') {
        i += 1;
    }
    return parse_utils.parseU16(payload[start..i]);
}

fn isValidSessionIdChar(ch: u8) bool {
    return std.ascii.isAlphanumeric(ch) or ch == '-' or ch == '_' or ch == '.' or ch == ':';
}
