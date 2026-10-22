import { fileURLToPath } from "node:url";
// Frozen v1 input preserves legacy installation regression coverage, never shipped in npm.
process.env.LT_SOURCE = fileURLToPath(
  new URL("./registry-v1.json", import.meta.url),
);
