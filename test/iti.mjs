// Chapter 18: C in ABAP. iti/mandel.c compiled to WebAssembly and by
// abapiti to the ABAP class ZCL_WASM_MANDEL; the classrun ZCL_OSD_FLEET_ITI
// draws the Mandelbrot set with it on a real open-steamgate engine. The
// drawing must equal iti/mandel.expected.txt, which is what the same C
// prints when compiled natively (iti/draw.c); with a C compiler on the
// PATH (cc), this test also compiles and runs the native program and checks
// the file is still what it prints.
//
//   OSD_HOME=<open-steamgate checkout> node test/iti.mjs [--print]
//
//  1. I1: native C, when cc is there, prints iti/mandel.expected.txt;
//  2. I2: the classrun in OSD prints the same 24 lines and the same sum.
import {spawn, spawnSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {createServer} from "node:net";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

// --print shows each classrun's output, as the chapter quotes it
const print = process.argv.includes("--print");
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.OSD_HOME;
if (home === undefined || home === "") {
  console.error("iti: set OSD_HOME to an open-steamgate checkout");
  process.exit(2);
}
const port = await new Promise((ok, fail) => {
  const probe = createServer().listen(0, "127.0.0.1", () => {
    const {port: free} = probe.address();
    probe.close(() => ok(free));
  }).on("error", fail);
});
const base = `http://localhost:${port}`;
const dir = mkdtempSync(join(tmpdir(), "osg-demo-iti-"));
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

console.log(`iti: building ${home} with OSD_PACKS=${repo}`);
const build = spawnSync("npm", ["run", "-s", "transpile"], {cwd: home, env, stdio: ["ignore", "ignore", "inherit"]});
if (build.status !== 0) {
  console.error(`iti: npm run transpile failed (${build.status})`);
  process.exit(1);
}

server = spawn(process.execPath, ["test/run.mjs"], {cwd: home, env, stdio: ["ignore", "ignore", "inherit"]});
console.log(`iti: engine PID ${server.pid} on port ${port}, STG_DB=file`);
const deadline = Date.now() + 180_000;
for (;;) {
  expect(server.exitCode === null, `the engine exited with ${server.exitCode}`);
  const ready = await fetch(`${base}/sap/bc/adt/discovery`).then((r) => r.ok, () => false);
  if (ready) break;
  if (Date.now() > deadline) {
    console.error("iti: the engine did not serve ADT within 180 s");
    process.exit(1);
  }
  await new Promise((ok) => setTimeout(ok, 1000));
}

const expected = readFileSync(join(repo, "iti", "mandel.expected.txt"), "utf8");
const lines = (text) => text.replace(/\r\n/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").trim();

await check("I1 native: the same C prints the expected drawing", async () => {
  const cc = spawnSync("cc", ["--version"], {encoding: "utf8"});
  if (cc.status !== 0) return "skipped: no cc on the PATH";
  const bin = join(dir, "draw");
  const made = spawnSync("cc", ["-O2", "-o", bin, join(repo, "iti", "draw.c"), join(repo, "iti", "mandel.c")], {encoding: "utf8"});
  expect(made.status === 0, `cc failed: ${made.stderr}`);
  const ran = spawnSync(bin, [], {encoding: "utf8"});
  expect(ran.status === 0 && lines(ran.stdout) === lines(expected), `native output differs:\n${ran.stdout}`);
  return "native drawing and sum as committed";
});

await check("I2 ABAP: ZCL_OSD_FLEET_ITI draws the same", async () => {
  const text = await classrun("ZCL_OSD_FLEET_ITI", {readOnly: true});
  const got = lines(text);
  expect(got === lines(expected), `the drawing differs from the native one:\n${text}`);
  return got.split("\n").pop();
});

stop();
const failed = results.filter((r) => !r.ok);
console.log(`iti: ${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length === 0 ? 0 : 1);
