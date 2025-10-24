import { defineConfig } from "tsup";
import { execSync } from "child_process";

export default defineConfig({
  entry: ["src/index.ts"],
  clean: true,
  format: ["cjs", "esm"],
  dts: true,
  onSuccess: async () => {
    // Copy package.json to the dist folder
    execSync("cp package.json dist/");
    return;
  },
});
