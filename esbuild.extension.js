const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

const sharedOpts = {
  bundle: true,
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  minify: false,
};

Promise.all([
  esbuild.context({ ...sharedOpts, entryPoints: ["src/extension.ts"],                          outfile: "out/extension.js" }),
  esbuild.context({ ...sharedOpts, entryPoints: ["src/workers/analysis-worker.ts"],             outfile: "out/workers/analysis-worker.js" }),
  esbuild.context({ ...sharedOpts, entryPoints: ["src/workers/schema-worker.ts"],               outfile: "out/workers/schema-worker.js" }),
]).then(async ([extCtx, analysisCtx, schemaCtx]) => {
  if (watch) {
    await extCtx.watch();
    await analysisCtx.watch();
    await schemaCtx.watch();
    console.log("Watching...");
  } else {
    for (const ctx of [extCtx, analysisCtx, schemaCtx]) {
      await ctx.rebuild();
      await ctx.dispose();
    }
    console.log("Build complete.");
  }
}).catch(() => process.exit(1));
