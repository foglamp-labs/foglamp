import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
  dts: true,
  // Don't wipe dist on (re)build: `tsdown --watch` cleans on startup, which
  // briefly removes index.mjs and races consumers that import it at boot (e.g.
  // the server's `bun --hot` dev process → ENOENT). A single-entry build
  // overwrites in place, so cleaning buys nothing here.
  clean: false,
  // The published entry (src/index.ts) intentionally has no workspace runtime
  // deps — wire types are mirrored locally in src/wire.ts (see contract-
  // conformance.ts). `ai` stays a peer dep; nothing else is bundled.
  external: ["ai", "@vercel/functions"],
});
