// Cross-platform `ANALYZE=true next build`: writes .next/analyze/{client,nodejs,edge}.html (not committed).
import { spawnSync } from "node:child_process";

const result = spawnSync("pnpm", ["exec", "next", "build"], { stdio: "inherit", shell: true, env: { ...process.env, ANALYZE: "true" } });
process.exit(result.status ?? 1);
