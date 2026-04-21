import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

type Asset = {
  fullPath: string;
  relPath: string;
  contentType: string;
};

const root = path.resolve(import.meta.dir, "..");
const distDir = path.join(root, "web", "dist");
const embedDir = path.join(root, "src", ".embedded-web");
const generatedFile = path.join(embedDir, "web_assets.generated.zig");

const files: Asset[] = [];

function collectFiles(dir: string, prefix = ""): void {
  if (!existsSync(dir)) return;

  for (const entry of readdirSync(dir)) {
    const item = path.join(dir, entry);
    const stat = statSync(item);
    const rel = prefix ? path.posix.join(prefix, entry) : entry;
    if (stat.isDirectory()) {
      collectFiles(item, rel);
      continue;
    }

    if (entry.endsWith(".map")) {
      continue;
    }

    files.push({
      fullPath: item,
      relPath: rel,
      contentType: detectContentType(item),
    });
  }
}

function detectContentType(filename: string): string {
  if (filename.endsWith(".html")) return "text/html; charset=utf-8";
  if (filename.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filename.endsWith(".css")) return "text/css; charset=utf-8";
  if (filename.endsWith(".svg")) return "image/svg+xml";
  if (filename.endsWith(".json")) return "application/json";
  if (filename.endsWith(".wasm")) return "application/wasm";
  if (filename.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

collectFiles(distDir, "");
files.sort((a, b) => a.relPath.localeCompare(b.relPath));

rmSync(embedDir, { recursive: true, force: true });
mkdirSync(embedDir, { recursive: true });

const lines = [
  "const std = @import(\"std\");",
  "",
  "pub const has_embedded_assets = " + (files.length > 0 ? "true" : "false") + ";",
  "",
  "pub const WebAsset = struct {",
  "    path: []const u8,",
  "    data: []const u8,",
  "    content_type: []const u8,",
  "};",
  "",
  "pub const assets = [_]WebAsset{",
];

for (const file of files) {
  const stagedPath = path.join(embedDir, file.relPath);
  mkdirSync(path.dirname(stagedPath), { recursive: true });
  copyFileSync(file.fullPath, stagedPath);

  lines.push(
    `    .{ .path = "${file.relPath}", .data = @embedFile("${file.relPath}"), .content_type = "${file.contentType}" },`,
  );
}

lines.push("};", "", "pub fn find(path: []const u8) ?WebAsset {", "    for (assets) |asset| {", "        if (std.mem.eql(u8, asset.path, path)) return asset;", "    }", "    return null;", "}");

writeFileSync(generatedFile, lines.join("\n"), "utf8");
