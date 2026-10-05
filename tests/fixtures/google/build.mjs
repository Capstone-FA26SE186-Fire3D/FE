import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
const require = createRequire(import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");

export async function googleFixtureBundle() {
  const root = process.cwd();
  const fixture = path.join(root, "tests/fixtures/google");
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "fet3d-google-test-"));
  const config = {
    mode: "development", devtool: false, entry: path.join(fixture, "entry.tsx"),
    output: { path: output, filename: "fixture.js" },
    resolve: { extensions: [".tsx", ".ts", ".js"], alias: {
      "@/configs/env": path.join(fixture, "env.ts"),
      "@": path.join(root, "src"), "next/navigation": path.join(fixture, "navigation.ts"),
      [path.join(root, "src/features/auth/firebase")]: path.join(fixture, "firebase.ts"),
    } },
    module: { rules: [{ test: /\.tsx?$/, use: path.join(fixture, "typescript-loader.mjs") }] },
    plugins: [new webpack.DefinePlugin({ "process.env.NODE_ENV": JSON.stringify("development") })],
  };
  await new Promise((resolve, reject) => {
    const compiler = webpack(config);
    compiler.run((error, stats) => {
      compiler.close(() => {
        if (error || stats?.hasErrors()) reject(error ?? new Error(stats.toString({ all: false, errors: true })));
        else resolve();
      });
    });
  });
  const bundlePath = path.join(output, "fixture.js");
  const bundle = await fs.readFile(bundlePath, "utf8");
  await fs.unlink(bundlePath);
  await fs.rmdir(output);
  return bundle;
}
