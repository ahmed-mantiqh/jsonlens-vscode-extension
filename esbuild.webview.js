const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

const ctx = esbuild.context({
  entryPoints: ["webview-src/index.tsx"],
  bundle: true,
  outfile: "media/webview-bundle.js",
  format: "iife",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  sourcemap: false,
  minify: false,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

ctx.then(async (c) => {
  if (watch) {
    await c.watch();
    console.log("Watching webview...");
  } else {
    await c.rebuild();
    await c.dispose();
    console.log("Webview build complete.");
  }
}).catch(() => process.exit(1));
