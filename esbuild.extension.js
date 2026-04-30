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
  // Prefer ESM entry points so esbuild can tree-shake and fully inline modules
  // like jsonc-parser (whose UMD build uses AMD define() with unresolved relative paths)
  mainFields: ["module", "main"],
  conditions: ["import", "require"],
};

Promise.all([
  esbuild.context({ ...sharedOpts, entryPoints: ["src/extension.ts"],                          outfile: "out/extension.js" }),
  esbuild.context({ ...sharedOpts, entryPoints: ["src/workers/analysis-worker.ts"],             outfile: "out/workers/analysis-worker.js" }),
  esbuild.context({ ...sharedOpts, entryPoints: ["src/workers/schema-worker.ts"],               outfile: "out/workers/schema-worker.js" }),
  esbuild.context({ ...sharedOpts, entryPoints: ["src/workers/parse-worker.ts"],                outfile: "out/workers/parse-worker.js" }),
]).then(async ([extCtx, analysisCtx, schemaCtx, parseCtx]) => {
  if (watch) {
    await extCtx.watch();
    await analysisCtx.watch();
    await schemaCtx.watch();
    await parseCtx.watch();
    console.log("Watching...");
  } else {
    for (const ctx of [extCtx, analysisCtx, schemaCtx, parseCtx]) {
      await ctx.rebuild();
      await ctx.dispose();
    }
    console.log("Build complete.");
  }
}).catch(() => process.exit(1));
