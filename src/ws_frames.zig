const std = @import("std");
const posix = std.posix;

pub const WebSocketOp = enum(u8) {
    continuation = 0x0,
    text = 0x1,
    binary = 0x2,
    close = 0x8,
    ping = 0x9,
    pong = 0xA,
};

pub const WebSocketFrame = struct {
    fin: bool,
    opcode: WebSocketOp,
    payload: []const u8,
    is_masked: bool,
    mask_key: [4]u8,
};

fn readExact(fd: posix.fd_t, buffer: []u8) !void {
    var offset: usize = 0;
    while (offset < buffer.len) {
        const n = try posix.read(fd, buffer[offset..]);
        if (n == 0) return error.EndOfStream;
        offset += n;
    }
}

pub fn readFrame(allocator: std.mem.Allocator, fd: posix.fd_t) !?WebSocketFrame {
    var header: [2]u8 = undefined;
    readExact(fd, &header) catch |err| switch (err) {
        error.EndOfStream => return null,
        else => return err,
    };

    const b0 = header[0];
    const b1 = header[1];

    const fin = (b0 & 0x80) != 0;
    const opcode = @as(WebSocketOp, @enumFromInt(b0 & 0x0F));
    const masked = (b1 & 0x80) != 0;
    var len_u64: u64 = @as(u64, b1 & 0x7F);
    if (len_u64 == 126) {
        var ext = [_]u8{0} ** 2;
        try readExact(fd, &ext);
        len_u64 = std.mem.readInt(u16, &ext, .big);
    } else if (len_u64 == 127) {
        var ext = [_]u8{0} ** 8;
        try readExact(fd, &ext);
        len_u64 = std.mem.readInt(u64, &ext, .big);
    }

    if (len_u64 > std.math.maxInt(usize)) {
        return error.InvalidLength;
    }
    const len = @as(usize, @intCast(len_u64));

    var mask_key: [4]u8 = .{ 0, 0, 0, 0 };
    if (masked) {
        try readExact(fd, &mask_key);
    }

    const payload = try allocator.alloc(u8, len);
    if (len > 0) {
        try readExact(fd, payload);
        if (masked) {
            for (payload, 0..) |*b, i| {
                b.* ^= mask_key[i & 3];
            }
        }
    }

    return WebSocketFrame{
        .fin = fin,
        .opcode = opcode,
        .payload = payload,
        .is_masked = masked,
        .mask_key = mask_key,
    };
}

pub fn writeFrame(
    fd: posix.fd_t,
    opcode: WebSocketOp,
    payload: []const u8,
) !void {
    const len = payload.len;
    var header: [14]u8 = undefined;
    var idx: usize = 0;

    header[idx] = 0x80 | @intFromEnum(opcode);
    idx += 1;

    if (len < 126) {
        header[idx] = @intCast(len);
        idx += 1;
    } else if (len < 65536) {
        header[idx] = 126;
        idx += 1;
        std.mem.writeInt(u16, header[idx .. idx + 2][0..2], @intCast(len), .big);
        idx += 2;
    } else {
        header[idx] = 127;
        idx += 1;
        std.mem.writeInt(u64, header[idx .. idx + 8][0..8], @intCast(len), .big);
        idx += 8;
    }

    try writeAll(fd, header[0..idx]);
    if (len > 0) {
        try writeAll(fd, payload);
    }
}

fn writeAll(fd: posix.fd_t, data: []const u8) !void {
    var offset: usize = 0;
    while (offset < data.len) {
        const n = try posix.write(fd, data[offset..]);
        if (n == 0) return error.BrokenPipe;
        offset += n;
    }
}
