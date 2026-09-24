import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
for (const dir of ["src", "scripts", "tests", "apps-script", "faq-studio"]) {
  for (const name of readdirSync(dir).filter((name) => name.endsWith(".js"))) {
    const result = spawnSync(process.execPath, ["--check", `${dir}/${name}`], {
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log("All JavaScript syntax checks passed.");
