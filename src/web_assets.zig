const std = @import("std");

pub const has_embedded_assets = true;

pub const WebAsset = struct {
    path: []const u8,
    data: []const u8,
    content_type: []const u8,
};

pub const assets = [_]WebAsset{
    .{ .path = "assets/__vite-browser-external-2447137e-BIHI7g3E.js", .data = @embedFile("web/dist/assets/__vite-browser-external-2447137e-BIHI7g3E.js"), .content_type = "text/javascript; charset=utf-8" },
    .{ .path = "assets/__vite-browser-external-2447137e-BIHI7g3E.js.map", .data = @embedFile("web/dist/assets/__vite-browser-external-2447137e-BIHI7g3E.js.map"), .content_type = "application/octet-stream" },
    .{ .path = "assets/index-C64aJLAS.js", .data = @embedFile("web/dist/assets/index-C64aJLAS.js"), .content_type = "text/javascript; charset=utf-8" },
    .{ .path = "assets/index-C64aJLAS.js.map", .data = @embedFile("web/dist/assets/index-C64aJLAS.js.map"), .content_type = "application/octet-stream" },
    .{ .path = "index.html", .data = @embedFile("web/dist/index.html"), .content_type = "text/html; charset=utf-8" },
};

pub fn find(path: []const u8) ?WebAsset {
    for (assets) |asset| {
        if (std.mem.eql(u8, asset.path, path)) return asset;
    }
    return null;
}
