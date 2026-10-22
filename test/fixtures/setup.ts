import { fileURLToPath } from "node:url";
// Minimal v1 fixture covers legacy installation, never shipped in npm.
process.env.LT_SOURCE = fileURLToPath(
  new URL("./registry-v1.json", import.meta.url),
);
