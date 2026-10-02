// End-to-end check of chapter 16's night set (src/l3/fleet_night.l3.yaml,
// DSL L3) against a real open-steamgate engine, with STG_DB=file like
// test/jobs.mjs, the only backend that schedules jobs today:
//
//   OSD_HOME=<open-steamgate checkout> node test/l3.mjs [--print]
//
//  1. N1: ZCL_OSD_FLEET_NIGHT_RUN runs the set in one dialog step (mode S) for
//     2026-10-01: the filter stage puts S001 S003 S004 S005 on the worklist
//     busy, the checks stage flags S004 Cumulus twice;
//  2. N2: ZCL_OSD_FLEET_NIGHT_JOBS starts it in jobs (mode P): stage 1 OPEN
//     with three piles of two ships, each PLANNED in its own job, stage 2
//     WAITING;
//  3. N3: the engine's worker runs the queue empty: the three jobs of stage
//     1, then, the gate opened once, two rules times two piles of the
//     worklist; seven jobs, none failed;
//  4. N4: ZCL_OSD_FLEET_NIGHT_STATE shows that run DONE with the same
//     worklist and the same two alerts as N1;
//  5. N5: ZCL_OSD_FLEET_NIGHT_SCHEDULE schedules the driver L3_NIGHT_D, a
//     second schedule( ) answers the same instance; the classrun run again
//     unschedules it at once, and the worker then finds nothing to run. The
//     02:00 start itself is not run.
import {spawn, spawnSync} from "node:child_process";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {createServer} from "node:net";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

// --print shows each classrun's output, as the chapter quotes it
const print = process.argv.includes("--print");
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.OSD_HOME;
if (home === undefined || home === "") {
  console.error("l3: set OSD_HOME to an open-steamgate checkout");
  process.exit(2);
}
const port = await new Promise((ok, fail) => {
  const probe = createServer().listen(0, "127.0.0.1", () => {
    const {port: free} = probe.address();
    probe.close(() => ok(free));
  }).on("error", fail);
});
const base = `http://localhost:${port}`;
const dir = mkdtempSync(join(tmpdir(), "osg-demo-l3-"));
const env = {...process.env, OSD_PACKS: repo, STG_PORT: String(port), STG_DB: "file",
  STG_DB_PATH: join(dir, "business.sqlite"), OSD_OPERATIONS_DB: join(dir, "operations.sqlite")};

const results = [];
let server;
function stop() {
  if (server?.pid !== undefined && server.exitCode === null) {
    try {
      process.kill(server.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}
process.on("exit", () => {
  stop();
  rmSync(dir, {recursive: true, force: true});
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stop();
    process.exit(130);
  });
}

async function check(name, body) {
  try {
    const detail = await body();
    results.push({name, ok: true, detail});
    console.log(`ok    ${name}${detail ? ` -- ${detail}` : ""}`);
  } catch (e) {
    results.push({name, ok: false, detail: e.message});
    console.log(`FAIL  ${name} -- ${e.message}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

// The worker steps between two requests can take longer than the engine's
// keep-alive timeout, and fetch may then reuse a socket the engine just
// closed ("fetch failed", other side closed). The CSRF fetch and read-only
// classruns retry once; a classrun that schedules jobs does not.
async function once(url, init, retry) {
  try {
    return await fetch(url, init);
  } catch (e) {
    if (!retry) throw new Error(`${e.message}: ${e.cause?.code ?? e.cause?.message ?? "no cause"}`);
    return fetch(url, init);
  }
}

async function classrun(name, {readOnly = false} = {}) {
  const token = await once(`${base}/sap/bc/adt/discovery`, {headers: {"x-csrf-token": "fetch"}}, true);
  const headers = {
    "x-csrf-token": token.headers.get("x-csrf-token"),
    cookie: (token.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; "),
  };
  const res = await once(`${base}/sap/bc/adt/oo/classrun/${name}`, {method: "POST", headers}, readOnly);
  const text = await res.text();
  if (print) console.log(`--- ${name}\n${text.trimEnd()}`);
  expect(res.ok, `${name}: HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text;
}

console.log(`l3: building ${home} with OSD_PACKS=${repo}`);
const build = spawnSync("npm", ["run", "-s", "transpile"], {cwd: home, env, stdio: ["ignore", "ignore", "inherit"]});
if (build.status !== 0) {
  console.error(`l3: npm run transpile failed (${build.status})`);
  process.exit(1);
}

server = spawn(process.execPath, ["test/run.mjs"], {cwd: home, env, stdio: ["ignore", "ignore", "inherit"]});
console.log(`l3: engine PID ${server.pid} on port ${port}, STG_DB=file`);
const deadline = Date.now() + 180_000;
for (;;) {
  expect(server.exitCode === null, `the engine exited with ${server.exitCode}`);
  const ready = await fetch(`${base}/sap/bc/adt/discovery`).then((r) => r.ok, () => false);
  if (ready) break;
  if (Date.now() > deadline) {
    console.error("l3: the engine did not serve ADT within 180 s");
    process.exit(1);
  }
  await new Promise((ok) => setTimeout(ok, 1000));
}

const workerEnv = {...env};
// without OSD_PACKS, which would make the worker's initializeABAP reseed the pack's tables
delete workerEnv.OSD_PACKS;
const cli = (...args) => spawnSync(process.execPath, ["tools/osd-batch-runs.mjs", ...args],
  {cwd: home, env: workerEnv, encoding: "utf8", timeout: 120_000});

const ALERTS = [
  "Alert low-steam-voyage: S004 Cumulus: 15 % steam, voyage V00016 departs 20261012",
  "Alert maintenance-voyage: S004 Cumulus: in maintenance, voyage V00016 departs 20261012",
  "2 alerts",
];
function inOrder(text, want) {
  const got = text.split("\n").map((l) => l.trimEnd());
  let at = 0;
  for (const line of want) {
    const i = typeof line === "string" ? got.indexOf(line, at) : got.findIndex((g, n) => n >= at && line.test(g));
    expect(i >= 0, `missing, or out of order: "${line}"\n--- got:\n${text}`);
    at = i + 1;
  }
}

await check("N1 mode S: the worklist busy, then two alerts on S004", async () => {
  const text = await classrun("ZCL_OSD_FLEET_NIGHT_RUN");
  inOrder(text, [/^Night set, mode S, run [A-F0-9]{32}: DONE$/, "Stage 1 candidates: DONE",
    "  busy-ship pile 1 S001-S002: DONE, 1 keys", "  busy-ship pile 2 S003-S004: DONE, 2 keys",
    "  busy-ship pile 3 S005-S006: DONE, 1 keys", "Stage 2 checks: DONE",
    "  low-steam-voyage pile 1 S001-S003: DONE, 0 alerts", "  low-steam-voyage pile 2 S004-S005: DONE, 1 alerts",
    "  maintenance-voyage pile 1 S001-S003: DONE, 0 alerts", "  maintenance-voyage pile 2 S004-S005: DONE, 1 alerts",
    "Worklist busy: S001 S003 S004 S005", ...ALERTS]);
  return "S001 S003 S004 S005; S004 low steam and in maintenance";
});

let run;
await check("N2 mode P: stage 1 in three jobs, stage 2 waiting", async () => {
  const text = await classrun("ZCL_OSD_FLEET_NIGHT_JOBS");
  const match = /^Night set, mode P, run ([A-F0-9]{32}): SUBMITTED$/m.exec(text);
  expect(match, `not submitted: ${text}`);
  run = match[1];
  inOrder(text, ["Stage 1 candidates: OPEN",
    "  busy-ship pile 1 S001-S002: PLANNED, 0 keys in job L3_NIGHT_101_0001",
    "  busy-ship pile 2 S003-S004: PLANNED, 0 keys in job L3_NIGHT_101_0002",
    "  busy-ship pile 3 S005-S006: PLANNED, 0 keys in job L3_NIGHT_101_0003",
    "Stage 2 checks: WAITING", "Worklist busy:", "0 alerts"]);
  return `run ${run}`;
});

await check("N3 worker: stage 1's three jobs, then the gate, then four", async () => {
  expect(run, "nothing was submitted");
  const worked = [];
  for (let i = 0; i < 12; i++) {
    const out = cli("work");
    const result = JSON.parse(out.stdout);
    if (result.kind === "empty") break;
    worked.push(result);
  }
  const names = worked.map((w) => `${w.run?.jobName}:${w.kind}`);
  expect(worked.length === 7, `not seven jobs: ${names.join(" ")}`);
  expect(worked.every((w) => w.kind === "completed" && w.run?.program === "ZOSD_FLEET_NIGHT"
    && w.run?.state === "COMPLETED"), `not all completed: ${names.join(" ")}`);
  // stage 2's jobs exist only once the last pile of stage 1 has opened the gate
  const stage = worked.map((w) => w.run.jobName.startsWith("L3_NIGHT_1") ? 1 : 2);
  expect(stage.join("") === "1112222", `not stage 1 before stage 2: ${names.join(" ")}`);
  return names.map((n) => n.split(":")[0]).join(" ");
});

await check("N4 state: the jobs' run DONE, the same worklist and alerts as mode S", async () => {
  expect(run, "nothing was submitted");
  const text = await classrun("ZCL_OSD_FLEET_NIGHT_STATE", {readOnly: true});
  inOrder(text, [`Night set, run ${run}`, "Stage 1 candidates: DONE",
    "  busy-ship pile 1 S001-S002: DONE, 1 keys in job L3_NIGHT_101_0001",
    "  busy-ship pile 2 S003-S004: DONE, 2 keys in job L3_NIGHT_101_0002",
    "  busy-ship pile 3 S005-S006: DONE, 1 keys in job L3_NIGHT_101_0003",
    "Stage 2 checks: DONE", "  low-steam-voyage pile 1 S001-S003: DONE, 0 alerts in job L3_NIGHT_202_0001",
    "  low-steam-voyage pile 2 S004-S005: DONE, 1 alerts in job L3_NIGHT_202_0002",
    "  maintenance-voyage pile 1 S001-S003: DONE, 0 alerts in job L3_NIGHT_203_0001",
    "  maintenance-voyage pile 2 S004-S005: DONE, 1 alerts in job L3_NIGHT_203_0002",
    "Worklist busy: S001 S003 S004 S005", ...ALERTS]);
  expect(!/PLANNED|WAITING|OPEN|FAILED/.test(text), `a pile or stage is not final: ${text}`);
  return "DONE, 2 alerts";
});

await check("N5 schedule: L3_NIGHT_D waits once; switched off, nothing waits", async () => {
  const on = await classrun("ZCL_OSD_FLEET_NIGHT_SCHEDULE");
  const match = /^Scheduled L3_NIGHT_D (\S+); again: (\S+)$/m.exec(on);
  expect(match && match[1] === match[2], `not scheduled once: ${on}`);
  expect(on.includes(`Waiting: '${match[1]}'`), `not waiting: ${on}`);
  // switched off at once: the facade deletes a job still in its outbox
  const off = await classrun("ZCL_OSD_FLEET_NIGHT_SCHEDULE");
  inOrder(off, [`Unscheduled L3_NIGHT_D ${match[1]}: 1 deleted`, "Waiting: ''"]);
  // and the worker finds nothing left to run
  const idle = JSON.parse(cli("work").stdout);
  expect(idle.kind === "empty", `the worker ran something: ${JSON.stringify(idle).slice(0, 300)}`);
  return `job count ${match[1]}, then deleted`;
});

stop();
const failed = results.filter((r) => !r.ok);
console.log(`l3: ${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length === 0 ? 0 : 1);
