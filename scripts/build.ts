import { copyFile } from "node:fs/promises";
await copyFile(
  new URL("../LICENSE", import.meta.url),
  new URL("../packages/cli/LICENSE", import.meta.url),
);
