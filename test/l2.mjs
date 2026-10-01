// Checks or rebuilds the fleet's L2 rule with open-steamgate's compiler:
//
//   OSD_HOME=<open-steamgate checkout> node test/l2.mjs [--write]
//
// Without --write it runs `tools/dsl-l2.mjs check`: the committed check class,
// test class and traces in src/l2 must be exactly what the rule builds to.
// With --write it runs `build` and rewrites them. The engine checkout needs a
// transpile (the templates render in the ABAP runtime).
import {spawnSync} from "node:child_process";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.OSD_HOME ? resolve(process.env.OSD_HOME) : "";
if (!home) {
  console.error("l2: set OSD_HOME to an open-steamgate checkout");
  process.exit(2);
}
const rule = join(repo, "src", "l2", "maintenance_no_voyage.l2.yaml");
const command = process.argv.includes("--write") ? "build" : "check";
const run = spawnSync(process.execPath, ["tools/dsl-l2.mjs", command, rule, "--out", join(repo, "src", "l2"),
  "--ddic", join(repo, "src", "ddic"), "--ddic", join(home, ".local/lars/open-abap-core/src")],
{cwd: home, encoding: "utf8"});
const said = `${run.stdout}${run.stderr}`.split("\n")
  .filter((l) => l && !/^(ICF registry|cross-reference|demo data):/.test(l)).join("\n");
console.log(said);
console.log(`l2: ${command} ${run.status === 0 ? "ok" : `failed (${run.status})`}`);
process.exit(run.status === 0 ? 0 : 1);
