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
  esbuild.context({ ...sharedOpts, entryPoints: ["src/extension.ts"], outfile: "out/extension.js" }),
  esbuild.context({ ...sharedOpts, entryPoints: ["src/workers/analysis-worker.ts"], outfile: "out/workers/analysis-worker.js" }),
]).then(async ([extCtx, workerCtx]) => {
  if (watch) {
    await extCtx.watch();
    await workerCtx.watch();
    console.log("Watching...");
  } else {
    await extCtx.rebuild();
    await extCtx.dispose();
    await workerCtx.rebuild();
    await workerCtx.dispose();
    console.log("Build complete.");
  }
}).catch(() => process.exit(1));
