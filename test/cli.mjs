// Builds the fleet's command line program and runs the scenario of book
// chapter 14 against it:
//
//   OSD_HOME=<open-steamgate checkout> node test/cli.mjs [--keep DIR]
//
// open-steamgate's osabap (tools/gogen/osabap.mjs) compiles
// cli/fleet/zosd_fleet_cli.prog.abap, with the fleet tables' definitions
// copied from src/ddic beside it, through the ABAP-to-Go transpiler into one
// native binary. It needs Go 1.26 on PATH and the checkout's library clones at
// their pins (npm run bootstrap). --keep DIR leaves the binary and its working
// folder there (test/cli-shots.mjs uses them).
import {spawnSync} from "node:child_process";
import {copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.OSD_HOME ? resolve(process.env.OSD_HOME) : "";
if (!home) {
  console.error("cli: set OSD_HOME to an open-steamgate checkout");
  process.exit(2);
}
const keepAt = process.argv.indexOf("--keep");
const work = keepAt > 0 ? resolve(process.argv[keepAt + 1]) : mkdtempSync(join(tmpdir(), "osg-demo-cli-"));
const stage = join(work, "stage");
rmSync(stage, {recursive: true, force: true});
mkdirSync(stage, {recursive: true});
for (const file of ["zosd_fleet_cli.prog.abap", "zosd_fleet_cli.prog.xml"]) copyFileSync(join(repo, "cli", "fleet", file), join(stage, file));
for (const table of ["zosd_fleet_ship", "zosd_fleet_stat"]) copyFileSync(join(repo, "src", "ddic", `${table}.tabl.xml`), join(stage, `${table}.tabl.xml`));

console.log(`cli: building ${join(stage, "zosd_fleet_cli.prog.abap")} with ${home}`);
const build = spawnSync(process.execPath, ["tools/gogen/osabap.mjs", join(stage, "zosd_fleet_cli.prog.abap")],
  {cwd: home, encoding: "utf8", env: {...process.env, GOFLAGS: process.env.GOFLAGS ?? "-buildvcs=false"}});
if (build.status !== 0) {
  console.error(`cli: the build failed\n${(build.stdout + build.stderr).slice(-1500)}`);
  process.exit(1);
}
const run = join(work, "run");
rmSync(run, {recursive: true, force: true});
mkdirSync(run, {recursive: true});
const fleet = join(run, process.platform === "win32" ? "fleet.exe" : "fleet");
copyFileSync(join(home, "tools", "gogen", ".out", process.platform === "win32" ? "osabap.exe" : "osabap"), fleet);
cpSync(join(repo, "cli", "data"), join(run, "data"), {recursive: true});

const results = [];
const check = (name, args, want) => {
  const r = spawnSync(fleet, args, {cwd: run, encoding: "utf8"});
  const out = `${r.stdout}${r.stderr}`;
  const problems = want(out, r.status);
  results.push(!problems);
  console.log(`${problems ? "FAIL" : "ok  "}  ${name}${problems ? ` -- ${problems}\n${out}` : ""}`);
};
const has = (out, ...lines) => lines.filter((l) => !out.includes(l)).map((l) => `missing "${l}"`).join("; ");

check("-help is the selection screen", ["-help"], (out, rc) =>
  rc !== 0 ? `rc ${rc}` : has(out, "--status", "--seed", "--file", "-db FILE", "-allow-read DIR"));
check("no -db: refused, rc 1", ["--status", "A"], (out, rc) =>
  rc !== 1 ? `rc ${rc}` : has(out, "keeps its rows in tables (ZOSD_FLEET_SHIP, ZOSD_FLEET_STAT): run it with -db FILE"));
check("--seed fills the tables", ["-db", "fleet.sqlite", "--seed"], (out, rc) =>
  rc !== 0 ? `rc ${rc}` : has(out, "Seeded 6 ships and 3 statuses", "S001 Albatross Aloft 82 Port Aurel", "S006 Old Boiler Maintenance 0 Tinmere", "6 ships"));
check("a second --seed leaves them", ["-db", "fleet.sqlite", "--seed"], (out, rc) =>
  rc !== 0 ? `rc ${rc}` : has(out, "Already 6 ships, nothing seeded"));
check("--status M", ["-db", "fleet.sqlite", "--status", "M"], (out, rc) =>
  rc !== 0 ? `rc ${rc}` : has(out, "S004 Cumulus Maintenance 15 Cloudhaven", "S006 Old Boiler Maintenance 0 Tinmere", "2 ships")
    || (out.includes("S001") ? "S001 is not in maintenance" : ""));
check("--file without -allow-read: refused by the sandbox", ["-db", "fleet.sqlite", "--file", "data/ships.csv"], (out, rc) =>
  rc !== 0 ? `rc ${rc}` : has(out, "Cannot read data/ships.csv Permission denied", "6 ships"));
check("--file with -allow-read loads the CSV", ["-db", "fleet.sqlite", "-allow-read", "data", "-dataset-home", "data", "--file", "ships.csv"], (out, rc) =>
  rc !== 0 ? `rc ${rc}` : has(out, "Loaded 2 ships from ships.csv", "S004 Cumulus Docked 95 Cloudhaven", "S007 Zephyr Aloft 77 Cloudhaven", "7 ships"));

const failed = results.filter((ok) => !ok).length;
console.log(`cli: ${results.length - failed} passed, ${failed} failed (binary: ${fleet})`);
if (keepAt < 0) rmSync(work, {recursive: true, force: true});
process.exit(failed === 0 ? 0 : 1);
