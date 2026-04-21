const generated = @import(".embedded-web/web_assets.generated.zig");

pub const has_embedded_assets = generated.has_embedded_assets;
pub const WebAsset = generated.WebAsset;
pub const assets = generated.assets;

pub fn find(path: []const u8) ?WebAsset {
    return generated.find(path);
}
