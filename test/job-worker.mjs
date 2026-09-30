// Works the queued background jobs of an open-steamgate instance: imports the
// job outbox, then runs queued steps until none is left (or, with --loop,
// keeps polling like the engine's worker until Ctrl+C).
//
//   cd <open-steamgate checkout>
//   STG_DB=file STG_DB_PATH=<the instance's business DB> \
//     node <this repo>/test/job-worker.mjs [--loop]
//
// It calls the engine's own exported worker functions and holds no job logic
// of its own. The engine's CLI, `node tools/osd-batch-runs.mjs work|worker`,
// does the same, but on open-steamgate main 3578a23a it never gets past
// initializeABAP with STG_DB=file: its top-level await and the import of
// tools/osd-job-port.mjs from test/setup.mjs wait on each other. Use the CLI
// again once that is fixed.
//
// The worker must see the instance's STG_DB, STG_DB_PATH and
// OSD_OPERATIONS_DB, and run in the engine checkout after a transpile. It
// ignores OSD_PACKS: with it, initializeABAP reseeds the pack's tables in the
// live instance's database.
//
// Without --loop it exits 1 when it worked no step or a step failed, and says
// why: nothing queued (a wrong STG_DB_PATH looks the same), or a RUNNING run
// that blocks the queue until it is interrupted.
import {join} from "node:path";
import {pathToFileURL} from "node:url";

const root = process.cwd();
delete process.env.OSD_PACKS;
const load = (file) => import(pathToFileURL(join(root, file)).href);
if (process.env.STG_DB !== "file") {
  console.error("job-worker: jobs need STG_DB=file and the instance's STG_DB_PATH");
  process.exit(2);
}
const {BatchRuns, workQueuedBatch} = await load("tools/osd-batch-runs.mjs");
const {drainJobOutbox} = await load("tools/osd-job-outbox.mjs");
const store = new BatchRuns(root);
const {initializeABAP} = await load("output/init.mjs");
await initializeABAP();

const loop = process.argv.includes("--loop");
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopping = true; });
let worked = 0;
let failed = 0;
const report = (fields) => console.log(JSON.stringify(fields));
try {
  while (!stopping) {
    const drained = await drainJobOutbox(store);
    if (drained?.imported) report({kind: "imported", count: drained.imported});
    const result = await workQueuedBatch(root, store);
    if (["completed", "failed", "advanced"].includes(result.kind)) {
      worked++;
      if (result.kind === "failed") failed++;
      const run = result.run ?? {};
      report({kind: result.kind, id: run.id, job: run.jobName, state: run.state,
        output: run.id ? store.output(run.id)?.lines : undefined});
    } else if (loop) {
      await new Promise((ok) => setTimeout(ok, 250));
    } else {
      report(result.kind === "busy" ?
        {kind: "busy", id: result.id, note: "a RUNNING run blocks the queue"} :
        {kind: result.kind, note: "no queued step"});
      break;
    }
  }
} finally {
  store.close();
}
process.exit(failed === 0 && (loop || worked > 0) ? 0 : 1);
