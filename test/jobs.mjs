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
//  4. test/job-worker.mjs, run against the same databases, imports the job
//     and runs its step to COMPLETED; the step prints the run ID;
//  5. ZCL_OSD_FLEET_BAL_VIEW shows the step's BAL log under that run ID, with
//     the audit's three messages and no error.
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

async function classrun(name) {
  const token = await fetch(`${base}/sap/bc/adt/discovery`, {headers: {"x-csrf-token": "fetch"}});
  const headers = {
    "x-csrf-token": token.headers.get("x-csrf-token"),
    cookie: (token.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; "),
  };
  const res = await fetch(`${base}/sap/bc/adt/oo/classrun/${name}`, {method: "POST", headers});
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
await check("J0a schedule: ZCL_OSD_FLEET_JOB releases ZOSD_FLEET_AUDIT", async () => {
  const text = await classrun("ZCL_OSD_FLEET_JOB");
  const match = /Fleet job ZOSD_FLEET_AUDIT (\S+) released; run ([A-F0-9]{32})/.exec(text);
  expect(match, `not released: ${text}`);
  run = match[2];
  return `job count ${match[1]}, run ${run}`;
});

await check("J0b worker: the step runs to COMPLETED", async () => {
  expect(run, "nothing was scheduled");
  const worker = spawnSync(process.execPath, [join(repo, "test", "job-worker.mjs")],
    {cwd: home, env, encoding: "utf8", timeout: 120_000});
  expect(worker.status === 0, `worker exited ${worker.status}: ${worker.stderr || worker.stdout}`);
  const done = worker.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  expect(done.length === 1, `expected one worked step, got ${done.length}: ${worker.stdout}`);
  const [step] = done;
  expect(step.kind === "completed" && step.job === "ZOSD_FLEET_AUDIT" && step.state === "COMPLETED",
    `step: ${JSON.stringify(step)}`);
  expect((step.output ?? []).some((line) => line.includes(`Fleet audit job ${run}: BAL `)),
    `step output lacks the run ID: ${JSON.stringify(step.output)}`);
  return `run ${step.id} COMPLETED`;
});

await check("J0c BAL: the job's log carries the run ID and no error", async () => {
  expect(run, "nothing was scheduled");
  const shown = await classrun("ZCL_OSD_FLEET_BAL_VIEW");
  const at = shown.indexOf(`Run ${run};`);
  expect(at >= 0, `no BAL log for run ${run}: ${shown}`);
  const log = shown.slice(at).split("\n").slice(0, 4).join("\n");
  expect(log.split("\n")[0].endsWith("errors 0"), `errors in the log: ${log}`);
  for (const text of ["1 S Fleet audit started", "2 I Observed 6 ships and 20 voyages",
    "3 S Fleet audit OK: 6 ships, 20 voyages"]) {
    expect(log.includes(text), `BAL lacks "${text}": ${log}`);
  }
  return "3 messages, errors 0";
});

stop();
const failed = results.filter((r) => !r.ok);
console.log(`jobs: ${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length === 0 ? 0 : 1);
