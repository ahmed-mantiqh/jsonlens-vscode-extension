const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

const ctx = esbuild.context({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  minify: false,
});

ctx.then(async (c) => {
  if (watch) {
    await c.watch();
    console.log("Watching...");
  } else {
    await c.rebuild();
    await c.dispose();
    console.log("Build complete.");
  }
}).catch(() => process.exit(1));
