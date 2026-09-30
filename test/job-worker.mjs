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
// OSD_OPERATIONS_DB, and run in the engine checkout after a transpile.
import {join} from "node:path";
import {pathToFileURL} from "node:url";

const root = process.cwd();
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
let failed = 0;
try {
  while (!stopping) {
    await drainJobOutbox(store);
    const result = await workQueuedBatch(root, store);
    if (["completed", "failed", "advanced"].includes(result.kind)) {
      if (result.kind === "failed") failed++;
      const run = result.run ?? {};
      console.log(JSON.stringify({kind: result.kind, id: run.id, job: run.jobName, state: run.state,
        output: run.id ? store.output(run.id)?.lines : undefined}));
    } else if (loop) {
      await new Promise((ok) => setTimeout(ok, 250));
    } else {
      break;
    }
  }
} finally {
  store.close();
}
process.exit(failed === 0 ? 0 : 1);
