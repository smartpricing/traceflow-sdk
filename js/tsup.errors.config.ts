import { defineConfig } from "tsup";

// Validate frontend distributions without installing the optional native Kafka peer.
export default defineConfig({
  entry: [
    "src/browser.ts",
    "src/react-native.ts",
    "src/nuxt.ts",
    "src/react.ts",
  ],
  format: ["cjs", "esm"],
  dts: true,
  clean: false,
});
