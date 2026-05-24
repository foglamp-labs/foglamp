import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
  dts: true,
  clean: true,
  // The published entry (src/index.ts) intentionally has no workspace runtime
  // deps — wire types are mirrored locally in src/wire.ts (see contract-
  // conformance.ts). `ai` stays a peer dep; nothing else is bundled.
  external: ["ai", "@vercel/functions"],
});
