import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"], // keep ESM (works best with Prisma)
  outDir: "dist",
  target: "node18",
  sourcemap: false,
  clean: true, // clears dist before each build
  dts: false, // no type files needed for runtime
  // splitting: false, // keeps a single output file
  splitting: true,
  shims: true, // provides __dirname fix automatically
  minify: false,
  treeshake: true,
  onSuccess:
    "echo 'Copying mail templates...' && cp -r mail-templates dist/ && echo 'Templates copied successfully'",
  platform: "node",
});
