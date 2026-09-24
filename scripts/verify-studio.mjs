import fs from "node:fs";
import { google } from "googleapis";
import { initAuth } from "../node_modules/@google/clasp/build/src/auth/auth.js";
try {
  const { credentials } = await initAuth({});
  const api = google.script({ version: "v1", auth: credentials });
  const { data } = await api.projects.getContent({
    scriptId: "192n_fhrliQP7MiA7SQ5vlgp8CL9sWapDg8WqNz-_U55S0dUWZBUcl8za",
  });
  const results = data.files.map((f) => {
    const ext =
      f.type === "SERVER_JS" ? ".js" : f.type === "HTML" ? ".html" : ".json";
    const local = fs.readFileSync("faq-studio/" + f.name + ext, "utf8");
    return {
      file: f.name + ext,
      matches: local.replace(/\r\n/g, "\n") === f.source.replace(/\r\n/g, "\n"),
    };
  });
  console.log(JSON.stringify(results));
  if (results.some((r) => !r.matches)) process.exitCode = 1;
} catch (e) {
  console.log(
    "Verification failed HTTP " + (e.response?.status || "unavailable"),
  );
  process.exitCode = 1;
}
