// Checks or rebuilds the fleet's L2 rule with open-steamgate's compiler:
//
//   OSD_HOME=<open-steamgate checkout> node test/l2.mjs [--write]
//
// Without --write it runs `tools/dsl-l2.mjs check`: the committed check class,
// test class and traces in src/l2 must be exactly what the rule builds to.
// With --write it runs `build` and rewrites them. The engine checkout needs a
// transpile (the templates render in the ABAP runtime).
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The book navigates with metadata, so missing companions must fail even
// though the upstream generator permits code-and-trace-only consumers.
export function checkTraces() {
  const dir = join(repo, "src", "l2");
  for (const stem of ["zcl_osd_fleet_l2_maint.clas", "zcl_osd_fleet_l2_maint.clas.testclasses"]) {
    const file = `${stem}.abap`;
    const abap = readFileSync(join(dir, file), "utf8");
    const trace = JSON.parse(readFileSync(join(dir, `${stem}.trace.json`), "utf8"));
    const meta = JSON.parse(readFileSync(join(dir, `${stem}.trace.meta.json`), "utf8"));
    assert.equal(trace.format, "osd-trace/1");
    assert.equal(meta.format, "osd-trace-meta/1");
    const output = trace.outputs.find((o) => o.file === file);
    assert.ok(output, `trace has no output ${file}`);
    const paired = meta.outputs.find((o) => o.file === file);
    assert.equal(paired?.hash, `sha256:${createHash("sha256").update(abap).digest("hex")}`, `${file}: stale metadata`);
    const covered = [];
    for (const entry of output.lines) {
      assert.ok(!("template_line" in entry) && !("path" in entry) && !("rule_line" in entry));
      assert.ok(entry.sources.length && entry.locations.length);
      assert.ok(entry.sources.every((s) => !s.file.startsWith("/") && s.node && s.selector.startsWith("/")));
      const [first, last] = entry.lines ?? [entry.line, entry.line];
      for (let line = first; line <= last; line++) covered.push(line);
    }
    const lineCount = abap.trimEnd().split("\n").length;
    assert.deepEqual(covered, Array.from({length: lineCount}, (_, i) => i + 1), `${file}: trace coverage`);
    if (stem.endsWith(".clas")) {
      const dateLine = abap.split("\n").findIndex((line) => line.trim() === "AND voy~dep_date > iv_date") + 1;
      assert.ok(dateLine > 0, "missing date condition");
      const origin = output.lines.find((e) => e.line === dateLine || (e.lines && e.lines[0] <= dateLine && e.lines[1] >= dateLine));
      assert.ok(origin.sources.some((s) => s.node === "rule/maintenance-ship-no-voyage/forbid/where/2" && s.selector === "/sref"));
      const physical = meta.lines.find((e) => e.file === file && e.line === dateLine);
      assert.equal(physical?.rule_line, 14);
      assert.equal(physical?.path, "/queries/1/where/2/pre");
      assert.match(readFileSync(join(process.env.OSD_HOME, meta.template), "utf8").split("\n")[physical.template_line - 1], /sref/);
    }
  }
  return "v1 provenance and metadata paired; date condition traced to rule line 14";
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
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
  if (run.status === 0) {
    try { console.log(`l2: ${checkTraces()}`); }
    catch (e) { console.error(`l2: ${e.message}`); process.exit(1); }
  }
  process.exit(run.status === 0 ? 0 : 1);

}
