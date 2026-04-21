pub const has_embedded_assets = false;

pub const WebAsset = struct {
    path: []const u8,
    data: []const u8,
    content_type: []const u8,
};

pub const assets = [_]WebAsset{};

pub fn find(path: []const u8) ?WebAsset {
    _ = path;
    return null;
}
