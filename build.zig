const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{
        .preferred_optimize_mode = .ReleaseSafe,
    });

    const options = b.addOptions();
    const embed_assets = b.option(bool, "embed-assets", "Bundle web assets into the binary") orelse false;
    const build_web = b.option(bool, "build-web", "Build web frontend as part of the Zig build") orelse false;
    const app_version = b.option([]const u8, "app-version", "Application version string") orelse readPackageVersion(b);
    options.addOption(bool, "embed_assets", embed_assets);
    options.addOption(bool, "build_web", build_web);
    options.addOption([]const u8, "app_version", app_version);

    const exe_mod = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });
    const zmx_ipc_module = b.createModule(.{
        .root_source_file = b.path("third_party/zmx/src/ipc.zig"),
        .target = target,
        .optimize = optimize,
    });
    const zmx_bridge_module = b.createModule(.{
        .root_source_file = b.path("src/zmx_bridge.zig"),
        .target = target,
        .optimize = optimize,
    });
    zmx_bridge_module.addImport("zmx_ipc", zmx_ipc_module);

    exe_mod.addImport("zmx_bridge", zmx_bridge_module);
    exe_mod.addImport("zmx_ipc", zmx_ipc_module);
    exe_mod.addOptions("build_options", options);

    const exe = b.addExecutable(.{
        .name = "supaterm-server",
        .root_module = exe_mod,
    });
    exe.linkLibC();
    exe.linkSystemLibrary("sqlite3");

    const check = b.step("check", "Verify compilation");
    const repo_root = b.pathFromRoot(".");
    if (embed_assets) {
        const web_build = b.addSystemCommand(&.{
            "sh",
            "-lc",
            "cd \"$1\" && bun run web:build",
            "sh",
            repo_root,
        });
        const embed_step = b.addSystemCommand(&.{
            "sh",
            "-lc",
            "cd \"$1\" && bun ./scripts/gen-web-assets.ts",
            "sh",
            repo_root,
        });
        embed_step.step.dependOn(&web_build.step);
        check.dependOn(&embed_step.step);
        exe.step.dependOn(&embed_step.step);
    } else if (build_web) {
        const web_build = b.addSystemCommand(&.{
            "sh",
            "-lc",
            "cd \"$1\" && bun run web:build",
            "sh",
            repo_root,
        });
        exe.step.dependOn(&web_build.step);
    }

    b.installArtifact(exe);

    check.dependOn(&exe.step);

    const run_step = b.step("run", "Run server");
    const run_cmd = b.addRunArtifact(exe);
    if (b.args) |args| run_cmd.addArgs(args);
    run_step.dependOn(&run_cmd.step);
}

fn readPackageVersion(b: *std.Build) []const u8 {
    const package_json_path = b.pathFromRoot("package.json");
    const package_json = std.fs.cwd().readFileAlloc(b.allocator, package_json_path, 1024 * 1024) catch
        @panic("failed to read package.json");
    const parsed = std.json.parseFromSlice(std.json.Value, b.allocator, package_json, .{}) catch
        @panic("failed to parse package.json");
    const object = parsed.value.object;
    const version_value = object.get("version") orelse @panic("package.json missing version");
    if (version_value != .string) @panic("package.json version must be a string");
    return b.allocator.dupe(u8, version_value.string) catch @panic("failed to copy version");
}
