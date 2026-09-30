// End-to-end check of the fleet background jobs against a real open-steamgate
// engine, on the only backend that schedules jobs today: SQLite in a file.
//
//   OSD_HOME=<open-steamgate checkout> node test/jobs.mjs
//
// What it does:
//  1. builds the engine with this repository as a pack, like test/slice.mjs;
//  2. starts it with STG_DB=file on a fresh business DB and operations store
//     in a temporary directory, and stops only that PID at the end;
//  3. J0: the classrun of ZCL_OSD_FLEET_JOB opens job ZOSD_FLEET_AUDIT, submits
//     report ZOSD_FLEET_JOB with a fresh run ID VIA JOB and releases it;
//  4. the engine's worker, `node tools/osd-batch-runs.mjs work` against the
//     same databases, imports the job and runs its step to COMPLETED; the
//     step prints the run ID; a second `work` finds the queue empty;
//  5. ZCL_OSD_FLEET_BAL_VIEW shows the step's BAL log under that run ID, with
//     the handle the step printed, the audit's three messages and no error;
//  6. J1/J2: the classrun of ZCL_OSD_FLEET_CHAIN schedules two chains, each a
//     voyage job and a readiness job that starts only after the voyage job
//     succeeded (PRED_JOBNAME/PRED_JOBCOUNT/PREDJOB_CHECKSTAT). The worker
//     runs until the queue is empty: in the chain expecting 20 voyages both
//     jobs complete; in the one expecting 21 the voyage job fails and the
//     readiness job stays WAITING. BAL holds <run>-VOY for both chains (the
//     failed one with its error) and <run>-READY only for the good one.
import {spawn, spawnSync} from "node:child_process";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {createServer} from "node:net";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.OSD_HOME;
if (home === undefined || home === "") {
  console.error("jobs: set OSD_HOME to an open-steamgate checkout");
  process.exit(2);
}
const port = await new Promise((ok, fail) => {
  const probe = createServer().listen(0, "127.0.0.1", () => {
    const {port: free} = probe.address();
    probe.close(() => ok(free));
  }).on("error", fail);
});
const base = `http://localhost:${port}`;
const dir = mkdtempSync(join(tmpdir(), "osg-demo-jobs-"));
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
  expect(res.ok, `${name}: HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text;
}

console.log(`jobs: building ${home} with OSD_PACKS=${repo}`);
const build = spawnSync("npm", ["run", "-s", "transpile"], {cwd: home, env, stdio: ["ignore", "ignore", "inherit"]});
if (build.status !== 0) {
  console.error(`jobs: npm run transpile failed (${build.status})`);
  process.exit(1);
}

server = spawn(process.execPath, ["test/run.mjs"], {cwd: home, env, stdio: ["ignore", "ignore", "inherit"]});
console.log(`jobs: engine PID ${server.pid} on port ${port}, STG_DB=file`);
const deadline = Date.now() + 180_000;
for (;;) {
  expect(server.exitCode === null, `the engine exited with ${server.exitCode}`);
  const ready = await fetch(`${base}/sap/bc/adt/discovery`).then((r) => r.ok, () => false);
  if (ready) break;
  if (Date.now() > deadline) {
    console.error("jobs: the engine did not serve ADT within 180 s");
    process.exit(1);
  }
  await new Promise((ok) => setTimeout(ok, 1000));
}

let run;
let jobCount;
let handle;
await check("J0a schedule: ZCL_OSD_FLEET_JOB releases ZOSD_FLEET_AUDIT", async () => {
  const text = await classrun("ZCL_OSD_FLEET_JOB");
  const match = /Fleet job ZOSD_FLEET_AUDIT (\S+) released; run ([A-F0-9]{32})/.exec(text);
  expect(match, `not released: ${text}`);
  jobCount = match[1];
  run = match[2];
  return `job count ${match[1]}, run ${run}`;
});

await check("J0b worker: the step runs to COMPLETED", async () => {
  expect(run, "nothing was scheduled");
  // the engine's own worker, on the instance's databases; without OSD_PACKS,
  // which would make its initializeABAP reseed the pack's tables
  const workerEnv = {...env};
  delete workerEnv.OSD_PACKS;
  const cli = (...args) => spawnSync(process.execPath, ["tools/osd-batch-runs.mjs", ...args],
    {cwd: home, env: workerEnv, encoding: "utf8", timeout: 120_000});
  const worked = cli("work");
  expect(worked.status === 0, `work exited ${worked.status}: ${worked.stderr || worked.stdout}`);
  const step = JSON.parse(worked.stdout);
  expect(step.kind === "completed" && step.run?.jobName === "ZOSD_FLEET_AUDIT" && step.run?.jobCount === jobCount
    && step.run?.state === "COMPLETED", `work: ${worked.stdout.slice(0, 400)}`);
  const shown = cli("show", step.run.id);
  expect(shown.status === 0, `show exited ${shown.status}: ${shown.stderr || shown.stdout}`);
  const lines = JSON.parse(shown.stdout).output?.lines ?? [];
  const printed = lines.map((line) => new RegExp(`Fleet audit job ${run}: BAL (\\S+)`).exec(line)).find(Boolean);
  expect(printed, `step output lacks the run ID: ${JSON.stringify(lines)}`);
  handle = printed[1];
  const idle = cli("work");
  expect(idle.status === 0 && JSON.parse(idle.stdout).kind === "empty", `queue not empty after the step: ${idle.stdout}`);
  return `job ${jobCount}, run ${step.run.id} COMPLETED`;
});

await check("J0c BAL: the job's log carries the run ID and no error", async () => {
  expect(run, "nothing was scheduled");
  const shown = await classrun("ZCL_OSD_FLEET_BAL_VIEW", {readOnly: true});
  const at = shown.indexOf(`Run ${run};`);
  expect(at >= 0, `no BAL log for run ${run}: ${shown}`);
  const log = shown.slice(at).split("\n").slice(0, 4).join("\n");
  expect(log.split("\n")[0] === `Run ${run}; handle ${handle}; errors 0`,
    `not the step's log (handle ${handle}) or errors in it: ${log}`);
  for (const text of ["1 S Fleet audit started", "2 I Observed 6 ships and 20 voyages",
    "3 S Fleet audit OK: 6 ships, 20 voyages"]) {
    expect(log.includes(text), `BAL lacks "${text}": ${log}`);
  }
  return "3 messages, errors 0";
});

const chains = {};
await check("J1a schedule: ZCL_OSD_FLEET_CHAIN schedules a good and a failing chain", async () => {
  const text = await classrun("ZCL_OSD_FLEET_CHAIN");
  for (const [label, key] of [["ok", "good"], ["forced failure", "failing"]]) {
    const match = new RegExp(`Fleet chain ${label}: run ([A-F0-9]{32}); voyage job (\\S+); ready job (\\S+) waits`).exec(text);
    expect(match, `no ${label} chain: ${text}`);
    chains[key] = {run: match[1], voyage: match[2], ready: match[3]};
  }
  return `good ${chains.good.run}, failing ${chains.failing.run}`;
});

await check("J1b/J2 worker: good chain completes; failing chain stops before readiness", async () => {
  expect(chains.good && chains.failing, "nothing was scheduled");
  const workerEnv = {...env};
  delete workerEnv.OSD_PACKS;
  const cli = (...args) => spawnSync(process.execPath, ["tools/osd-batch-runs.mjs", ...args],
    {cwd: home, env: workerEnv, encoding: "utf8", timeout: 120_000});
  const worked = [];
  for (let i = 0; i < 6; i++) {
    const out = cli("work");
    const result = JSON.parse(out.stdout);
    if (result.kind === "empty") break;
    expect(out.status === (result.kind === "failed" ? 1 : 0), `work exited ${out.status} for ${result.kind}`);
    worked.push(result);
  }
  const job = (name, count) => worked.find((w) => w.run?.jobName === name && w.run?.jobCount === count);
  const V = "ZOSD_FLEET_VOYAGE", R = "ZOSD_FLEET_READY";
  const byCount = (count) => job(count === chains.good.voyage || count === chains.failing.voyage ? V : R, count);
  const state = (count) => byCount(count)?.run?.state;
  expect(worked.length === 3, `worked ${worked.length} steps, expected 3: ${worked.map((w) => `${w.run?.jobName} ${w.run?.state}`).join(", ")}`);
  expect(state(chains.good.voyage) === "COMPLETED" && state(chains.good.ready) === "COMPLETED",
    `good chain: voyage ${state(chains.good.voyage)}, ready ${state(chains.good.ready)}`);
  const goodVoyageAt = worked.indexOf(byCount(chains.good.voyage));
  expect(goodVoyageAt < worked.indexOf(byCount(chains.good.ready)), "readiness ran before its voyage job");
  expect(state(chains.failing.voyage) === "FAILED", `failing voyage: ${state(chains.failing.voyage)}`);
  expect(!byCount(chains.failing.ready), "the failing chain's readiness job ran");
  const listed = JSON.parse(cli("list").stdout);
  const waiting = listed.find((r) => r.jobName === R && r.jobCount === chains.failing.ready);
  expect(waiting?.state === "WAITING", `failing chain's readiness job: ${waiting?.state}`);
  return "good: voyage then ready COMPLETED; failing: voyage FAILED, ready WAITING";
});

await check("J1c/J2 BAL: voyage logs for both chains, readiness only for the good one", async () => {
  expect(chains.good && chains.failing, "nothing was scheduled");
  const shown = await classrun("ZCL_OSD_FLEET_BAL_VIEW", {readOnly: true});
  const log = (id) => {
    const at = shown.indexOf(`Run ${id};`);
    return at < 0 ? undefined : shown.slice(at).split("\n").slice(0, 4).join("\n");
  };
  const goodVoy = log(`${chains.good.run}-VOY`);
  expect(goodVoy?.split("\n")[0].endsWith("errors 0") && goodVoy.includes("3 S Voyage step OK: 20 voyages"),
    `good voyage log: ${goodVoy}`);
  const goodReady = log(`${chains.good.run}-READY`);
  expect(goodReady?.split("\n")[0].endsWith("errors 0")
    && goodReady.includes("3 S Fleet ready: 6 ships after a clean voyage step"), `good readiness log: ${goodReady}`);
  const badVoy = log(`${chains.failing.run}-VOY`);
  expect(badVoy?.split("\n")[0].endsWith("errors 1") && badVoy.includes("3 E Voyage step failed: 20 voyages, expected 21"),
    `failing voyage log: ${badVoy}`);
  expect(log(`${chains.failing.run}-READY`) === undefined, "the failing chain has a readiness log");
  return "good: VOY and READY clean; failing: VOY with its error, no READY";
});

stop();
const failed = results.filter((r) => !r.ok);
console.log(`jobs: ${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length === 0 ? 0 : 1);
