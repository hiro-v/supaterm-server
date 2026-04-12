pub fn parseU16(value: []const u8) ?u16 {
    if (value.len == 0) return null;
    var parsed: u32 = 0;
    for (value) |ch| {
        if (ch < '0' or ch > '9') return null;
        const next = (parsed * 10) + (ch - '0');
        if (next > std.math.maxInt(u16)) return null;
        parsed = next;
    }
    return @intCast(parsed);
}

const std = @import("std");

test "parseU16 accepts valid values" {
    try std.testing.expectEqual(@as(?u16, 0), parseU16("0"));
    try std.testing.expectEqual(@as(?u16, 80), parseU16("80"));
    try std.testing.expectEqual(@as(?u16, 65535), parseU16("65535"));
}

test "parseU16 rejects invalid values" {
    try std.testing.expectEqual(@as(?u16, null), parseU16(""));
    try std.testing.expectEqual(@as(?u16, null), parseU16("abc"));
    try std.testing.expectEqual(@as(?u16, null), parseU16("65536"));
}
