const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{
        .preferred_optimize_mode = .ReleaseSafe,
    });

    const options = b.addOptions();
    const embed_assets = b.option(bool, "embed-assets", "Bundle web assets into the binary") orelse false;
    const build_web = b.option(bool, "build-web", "Build web frontend as part of the Zig build") orelse false;
    options.addOption(bool, "embed_assets", embed_assets);
    options.addOption(bool, "build_web", build_web);

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
    if (embed_assets) {
        const dist_ready = b.addSystemCommand(&.{
            "sh",
            "-lc",
            "test -d web/dist || bun run web:build",
        });
        const embed_step = b.addSystemCommand(&.{ "bun", "run", "scripts/gen-web-assets.ts" });
        embed_step.step.dependOn(&dist_ready.step);
        check.dependOn(&embed_step.step);
        exe.step.dependOn(&embed_step.step);
    } else if (build_web) {
        const web_build = b.addSystemCommand(&.{
            "sh",
            "-lc",
            "bun run web:build",
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
