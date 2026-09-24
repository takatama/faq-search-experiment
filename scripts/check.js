import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

for (const directory of ["src", "scripts", "tests"]) {
  for (const name of readdirSync(directory).filter((file) => file.endsWith(".js"))) {
    const path = `${directory}/${name}`;
    const result = spawnSync(process.execPath, ["--check", path], {
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

console.log("JavaScript syntax check passed.");
