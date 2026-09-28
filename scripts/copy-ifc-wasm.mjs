import { cp, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = new URL("../node_modules/web-ifc/web-ifc.wasm", import.meta.url);
const destination = new URL("../public/ifc/web-ifc.wasm", import.meta.url);

await stat(fileURLToPath(source));
await mkdir(fileURLToPath(new URL(".", destination)), { recursive: true });
await cp(fileURLToPath(source), fileURLToPath(destination));
