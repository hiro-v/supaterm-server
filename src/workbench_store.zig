const std = @import("std");
const c = @cImport({
    @cInclude("sqlite3.h");
});

pub const SnapshotRecord = struct {
    workbench_id: []u8,
    state_json: []u8,
    updated_at_unix_ms: i64,

    pub fn deinit(self: *SnapshotRecord, allocator: std.mem.Allocator) void {
        allocator.free(self.workbench_id);
        allocator.free(self.state_json);
        self.* = undefined;
    }
};

pub const WorkbenchStore = struct {
    allocator: std.mem.Allocator,
    db: *c.sqlite3,
    lock: std.Thread.Mutex,

    pub fn init(allocator: std.mem.Allocator, db_path: []const u8) !WorkbenchStore {
        const db_path_z = try allocator.dupeZ(u8, db_path);
        defer allocator.free(db_path_z);

        var db_ptr: ?*c.sqlite3 = null;
        const flags = c.SQLITE_OPEN_READWRITE | c.SQLITE_OPEN_CREATE | c.SQLITE_OPEN_FULLMUTEX;
        if (c.sqlite3_open_v2(db_path_z.ptr, &db_ptr, flags, null) != c.SQLITE_OK or db_ptr == null) {
            if (db_ptr) |db| _ = c.sqlite3_close(db);
            return error.SqliteOpenFailed;
        }

        var store = WorkbenchStore{
            .allocator = allocator,
            .db = db_ptr.?,
            .lock = .{},
        };
        errdefer store.deinit();

        try store.exec(
            \\CREATE TABLE IF NOT EXISTS workbench_snapshots (
            \\  workbench_id TEXT PRIMARY KEY NOT NULL,
            \\  state_json TEXT NOT NULL,
            \\  updated_at_unix_ms INTEGER NOT NULL
            \\)
        );
        return store;
    }

    pub fn deinit(self: *WorkbenchStore) void {
        _ = c.sqlite3_close(self.db);
        self.* = undefined;
    }

    pub fn loadSnapshot(
        self: *WorkbenchStore,
        allocator: std.mem.Allocator,
        workbench_id: []const u8,
    ) !?SnapshotRecord {
        self.lock.lock();
        defer self.lock.unlock();

        const statement =
            \\SELECT state_json, updated_at_unix_ms
            \\FROM workbench_snapshots
            \\WHERE workbench_id = ?1
        ;
        const stmt = try self.prepare(statement);
        defer _ = c.sqlite3_finalize(stmt);

        try bindText(stmt, 1, workbench_id);

        const step_result = c.sqlite3_step(stmt);
        if (step_result == c.SQLITE_DONE) {
            return null;
        }
        if (step_result != c.SQLITE_ROW) {
            return error.SqliteStepFailed;
        }

        const state_ptr = c.sqlite3_column_text(stmt, 0) orelse return error.SqliteColumnFailed;
        const state_len = @as(usize, @intCast(c.sqlite3_column_bytes(stmt, 0)));
        const updated_at_unix_ms = c.sqlite3_column_int64(stmt, 1);

        return .{
            .workbench_id = try allocator.dupe(u8, workbench_id),
            .state_json = try allocator.dupe(u8, state_ptr[0..state_len]),
            .updated_at_unix_ms = updated_at_unix_ms,
        };
    }

    pub fn saveSnapshot(
        self: *WorkbenchStore,
        workbench_id: []const u8,
        state_json: []const u8,
    ) !i64 {
        self.lock.lock();
        defer self.lock.unlock();

        const updated_at_unix_ms = std.time.milliTimestamp();
        const statement =
            \\INSERT INTO workbench_snapshots (workbench_id, state_json, updated_at_unix_ms)
            \\VALUES (?1, ?2, ?3)
            \\ON CONFLICT(workbench_id) DO UPDATE SET
            \\  state_json = excluded.state_json,
            \\  updated_at_unix_ms = excluded.updated_at_unix_ms
        ;
        const stmt = try self.prepare(statement);
        defer _ = c.sqlite3_finalize(stmt);

        try bindText(stmt, 1, workbench_id);
        try bindText(stmt, 2, state_json);
        if (c.sqlite3_bind_int64(stmt, 3, updated_at_unix_ms) != c.SQLITE_OK) {
            return error.SqliteBindFailed;
        }

        if (c.sqlite3_step(stmt) != c.SQLITE_DONE) {
            return error.SqliteStepFailed;
        }
        return updated_at_unix_ms;
    }

    fn exec(self: *WorkbenchStore, sql: [*:0]const u8) !void {
        var errmsg: [*c]u8 = null;
        defer if (errmsg != null) c.sqlite3_free(errmsg);
        if (c.sqlite3_exec(self.db, sql, null, null, &errmsg) != c.SQLITE_OK) {
            return error.SqliteExecFailed;
        }
    }

    fn prepare(self: *WorkbenchStore, sql: [*:0]const u8) !*c.sqlite3_stmt {
        var stmt: ?*c.sqlite3_stmt = null;
        if (c.sqlite3_prepare_v2(self.db, sql, -1, &stmt, null) != c.SQLITE_OK or stmt == null) {
            return error.SqlitePrepareFailed;
        }
        return stmt.?;
    }
};

fn bindText(stmt: *c.sqlite3_stmt, index: c_int, value: []const u8) !void {
    if (c.sqlite3_bind_text(
        stmt,
        index,
        value.ptr,
        @as(c_int, @intCast(value.len)),
        c.SQLITE_STATIC,
    ) != c.SQLITE_OK) {
        return error.SqliteBindFailed;
    }
}

test "workbench store saves and loads snapshots" {
    var store = try WorkbenchStore.init(std.testing.allocator, ":memory:");
    defer store.deinit();

    const state_json = "{\"workspaces\":[],\"activeWorkspaceId\":\"ws.1\",\"sidebarCollapsed\":false}";
    const saved_at = try store.saveSnapshot("default", state_json);
    try std.testing.expect(saved_at > 0);

    var snapshot = (try store.loadSnapshot(std.testing.allocator, "default")).?;
    defer snapshot.deinit(std.testing.allocator);

    try std.testing.expectEqualStrings("default", snapshot.workbench_id);
    try std.testing.expectEqualStrings(state_json, snapshot.state_json);
    try std.testing.expect(snapshot.updated_at_unix_ms >= saved_at);
}
