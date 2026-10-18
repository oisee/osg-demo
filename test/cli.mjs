// Builds the fleet's command line programs and runs the scenario of book
// chapter 14 against it:
//
//   OSD_HOME=<open-steamgate checkout> node test/cli.mjs [--keep DIR]
//
// open-steamgate's osabap (tools/gogen/osabap.mjs) compiles
// cli/fleet/zosd_fleet_cli.prog.abap, with the fleet tables' definitions
// (copies of src/ddic) and its selection texts (.prog.xml) beside it, through
// the ABAP-to-Go transpiler into one native binary. It needs Go 1.26 on PATH
// and the checkout's library clones at their pins (npm run bootstrap).
// It also compiles cli/csv/zosd_fleet_csv.prog.abap and checks its CSV list.
// --keep DIR leaves the binary and its working folder there (test/cli-shots.mjs
// uses them). With GOOS/GOARCH for another platform it only builds, and says
// where the binary is.
//
// cli/fleet holds copies of the two fleet tables' .tabl.xml, because osabap
// compiles only the tables beside a report; this script fails when they are
// not the same as src/ddic's.
import {spawnSync} from "node:child_process";
import {copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
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
if (keepAt > 0 && !process.argv[keepAt + 1]) {
  console.error("cli: --keep needs a directory");
  process.exit(2);
}
const work = keepAt > 0 ? resolve(process.argv[keepAt + 1]) : mkdtempSync(join(tmpdir(), "osg-demo-cli-"));
mkdirSync(work, {recursive: true});
for (const table of ["zosd_fleet_ship", "zosd_fleet_stat"]) {
  if (readFileSync(join(repo, "cli", "fleet", `${table}.tabl.xml`), "utf8") !== readFileSync(join(repo, "src", "ddic", `${table}.tabl.xml`), "utf8")) {
    console.error(`cli: cli/fleet/${table}.tabl.xml is not the same as src/ddic/${table}.tabl.xml; copy it over`);
    process.exit(1);
  }
}
const report = join(repo, "cli", "fleet", "zosd_fleet_cli.prog.abap");
const target = {os: process.env.GOOS || {win32: "windows"}[process.platform] || process.platform,
  arch: process.env.GOARCH || {x64: "amd64"}[process.arch] || process.arch};
const native = target.os === ({win32: "windows"}[process.platform] || process.platform)
  && target.arch === ({x64: "amd64"}[process.arch] || process.arch);
const exe = target.os === "windows" ? ".exe" : "";

const run = join(work, "run");
rmSync(run, {recursive: true, force: true});
mkdirSync(run, {recursive: true});
const fleet = join(run, `fleet${exe}`);
const csv = join(run, `fleet-csv${exe}`);
const csvReport = join(repo, "cli", "csv", "zosd_fleet_csv.prog.abap");
const buildReport = (report, binary) => {
  console.log(`cli: building ${report} for ${target.os}/${target.arch} with ${home}`);
  rmSync(join(home, "tools", "gogen", ".out", `osabap${exe}`), {force: true});
  const build = spawnSync(process.execPath, ["tools/gogen/osabap.mjs", report],
    {cwd: home, encoding: "utf8", env: {...process.env, GOFLAGS: process.env.GOFLAGS ?? "-buildvcs=false"}});
  if (build.status !== 0) {
    console.error(`cli: the build failed\n${(build.stdout + build.stderr).slice(-1500)}`);
    process.exit(1);
  }
  copyFileSync(join(home, "tools", "gogen", ".out", `osabap${exe}`), binary);
};
buildReport(report, fleet);
if (!native) {
  buildReport(csvReport, csv);
  console.log(`cli: built for ${target.os}/${target.arch}, not run here: ${fleet}, ${csv}`);
  process.exit(0);
}
cpSync(join(repo, "cli", "data"), join(run, "data"), {recursive: true});
// a good ship before the bad one: the rollback must take it back too
writeFileSync(join(run, "data", "bad.csv"), "S010,Plover,A,40,Tinmere\nS008,Gauge,A,plenty,Tinmere\n");
writeFileSync(join(run, "data", "last.csv"), "S009,Kestrel,A,50,Tinmere");

const results = [];
const check = (name, args, want, input, binary = fleet, cwd = run) => {
  const r = spawnSync(binary, args, {cwd, encoding: "utf8", input});
  const out = `${r.stdout}${r.stderr}`;
  const problems = want(out, r.status, r.stderr, r.stdout);
  results.push(!problems);
  console.log(`${problems ? "FAIL" : "ok  "}  ${name}${problems ? ` -- ${problems}\n${out}` : ""}`);
};
// "N ships" must be a whole line, so "6 ships" never matches "16 ships"
const has = (out, ...lines) => lines.filter((l) => (/^\d+ ships$/.test(l) ? !new RegExp(`^\\s*${l}\\s*$`, "m").test(out) : !out.includes(l)))
  .map((l) => `missing "${l}"`).join("; ");

// each option on its line with its selection text from the .prog.xml
const labels = [["--status", "Status \\(A, D, M\\)", "P_STATUS"], ["--seed", "Seed the six ships", "P_SEED"], ["--file", "Ships from a CSV file", "P_FILE"]];
check("-help is the selection screen, with its texts", ["-help"], (out, rc) =>
  rc !== 0 ? `rc ${rc}` : has(out, "-db FILE", "-allow-read DIR")
    || labels.filter(([o, t, p]) => !new RegExp(`^[ \\t]*${o}[ \\t]+${t} \\(${p},`, "m").test(out)).map(([o]) => `${o} without its text`).join("; "));
check("no -db: refused, rc 1", ["--status", "A"], (out, rc) =>
  rc !== 1 ? `rc ${rc}` : has(out, "keeps its rows in tables (ZOSD_FLEET_SHIP, ZOSD_FLEET_STAT): run it with -db FILE"));
check("--seed fills the tables", ["-db", "fleet.sqlite", "--seed"], (out, rc) =>
  rc !== 0 ? `rc ${rc}` : has(out, "Seeded 6 ships and 3 statuses", "S001 Albatross Aloft 82 Port Aurel", "S006 Old Boiler Maintenance 0 Tinmere", "6 ships"));
check("a second --seed leaves them", ["-db", "fleet.sqlite", "--seed"], (out, rc) =>
  rc !== 0 ? `rc ${rc}` : has(out, "Already 6 ships, nothing seeded"));
check("--status M", ["-db", "fleet.sqlite", "--status", "M"], (out, rc) =>
  rc !== 0 ? `rc ${rc}` : has(out, "S004 Cumulus Maintenance 15 Cloudhaven", "S006 Old Boiler Maintenance 0 Tinmere", "2 ships")
    || (out.includes("S001") ? "S001 is not in maintenance" : ""));
check("--status m is upper-cased", ["-db", "fleet.sqlite", "--status", "m"], (out, rc) =>
  rc !== 0 ? `rc ${rc}` : has(out, "S004 Cumulus Maintenance 15 Cloudhaven", "2 ships"));
// a refused import ends the run with MESSAGE ... TYPE 'E': the message on
// stderr, exit 1, no list; lines written before it stay on stdout
const refused = (out, rc, err, message) => rc !== 1 ? `rc ${rc}` : has(err, message)
  || (/ships$/m.test(out) ? "the list was written after the message" : "");
check("--file without -allow-read: refused by the sandbox", ["-db", "fleet.sqlite", "--file", "data/ships.csv"], (out, rc, err) =>
  refused(out, rc, err, "Error: cannot read data/ships.csv, Permission denied"));
check("a ship with a bad number: refused, after the --seed line", ["-db", "fleet.sqlite", "--seed", "-allow-read", "data", "-dataset-home", "data", "--file", "bad.csv"], (out, rc, err, stdout) =>
  refused(out, rc, err, "Error: ship S008, steam plenty is not a number; nothing loaded")
    || has(stdout, "Already 6 ships, nothing seeded"));
check("... and nothing of that file kept", ["-db", "fleet.sqlite"], (out, rc) =>
  rc !== 0 ? `rc ${rc}` : has(out, "6 ships") || (/^S0(08|10) /m.test(out) ? "a ship of the refused file was kept" : ""));
// without a terminal the selection screen is asked line by line
check("no options, no terminal: the fields line by line", ["-db", "fleet.sqlite"], (out, rc) =>
  rc !== 0 ? `rc ${rc}` : has(out, "Status (A, D, M)", "Seed the six ships", "Ships from a CSV file", "S004 Cumulus Maintenance 15 Cloudhaven", "2 ships")
    || (out.includes("S001") ? "S001 is not in maintenance" : ""), "M\n\n\n");
check("--file with -allow-read loads the CSV", ["-db", "fleet.sqlite", "-allow-read", "data", "-dataset-home", "data", "--file", "ships.csv"], (out, rc) =>
  rc !== 0 ? `rc ${rc}` : has(out, "Loaded 2 ships from ships.csv", "S004 Cumulus Docked 95 Cloudhaven", "S007 Zephyr Aloft 77 Cloudhaven", "7 ships")
    || (/S008|S010/.test(out) ? "a ship of the refused file was kept" : ""));
check("a last line without a line feed is read", ["-db", "fleet.sqlite", "-allow-read", "data", "-dataset-home", "data", "--file", "last.csv"], (out, rc) =>
  rc !== 0 ? `rc ${rc}` : has(out, "Loaded 1 ships from last.csv", "S009 Kestrel Aloft 50 Tinmere", "8 ships"));

// a frontend CSV upload needs a read grant too; this folder is also the F4 browser's
buildReport(csvReport, csv);
const data = join(work, "data");
rmSync(data, {recursive: true, force: true});
mkdirSync(data, {recursive: true});
for (const file of ["fleet.csv", "ships.csv"]) copyFileSync(join(repo, "cli", "data", file), join(data, file));
const checkCsv = (name, args, want) => check(name, args, want, undefined, csv, data);
checkCsv("CSV -help has the file field and read grant", ["-help"], (out, rc) =>
  rc !== 0 ? `rc ${rc}` : has(out, "--file", "Fleet CSV file (P_FILE, value)", "--p-name", "-allow-read DIR"));
// the tag leaves empty lines after ULINE and indents the count; main does not
const lines = (out) => out.split("\n").map((line) => line.trim()).filter(Boolean).join("\n");
const rule = "-".repeat(72);
const list = [
  "fleet.csv",
  rule,
  "| SHIP_ID | NAME        | STATUS | STEAM_PCT | HOME_PORT  |",
  rule,
  "| S001    | Albatross   | A      | 82        | Port Aurel |",
  "| S002    | Nimbus      | D      | 100       | Port Aurel |",
  "| S003    | Brass Heron | A      | 64        | Cloudhaven |",
  "| S004    | Cumulus     | M      | 15        | Cloudhaven |",
  "| S005    | Lady Kelvin | D      | 90        | Tinmere    |",
  "| S006    | Old Boiler  | M      | 0         | Tinmere    |",
  rule,
  "6 rows, 5 columns",
].join("\n");
checkCsv("CSV with -allow-read lists the headings and six ships", ["--p-file", "fleet.csv", "-allow-read", data], (out, rc, err, stdout) =>
  rc !== 0 ? `rc ${rc}` : err ? `stderr: ${err}` : lines(stdout) !== list ? "not the six-row CSV list with three 72-character rules" : "");
checkCsv("CSV without -allow-read: refused by the sandbox", ["--p-file", "fleet.csv"], (out, rc, err, stdout) =>
  rc !== 1 ? `rc ${rc}` : err !== "osabap: permission denied\n" ? "not the permission denial" : stdout ? "the list was written without a read grant" : "");

const failed = results.filter((ok) => !ok).length;
console.log(`cli: ${results.length - failed} passed, ${failed} failed (binary: ${fleet})`);
if (keepAt < 0) rmSync(work, {recursive: true, force: true});
process.exit(failed === 0 ? 0 : 1);
