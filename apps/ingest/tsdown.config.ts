import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/main.ts",
  format: "esm",
  outDir: "./dist",
  clean: true,
  noExternal: [/@watchtower\/.*/],
});
