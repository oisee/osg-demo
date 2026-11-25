// The fleet as an OCI layer, and a system pinned by digest (book chapter 24),
// in the style of test/slice.mjs, against an open-steamgate checkout.
//
//   OSD_HOME=<open-steamgate checkout> node test/layer.mjs [--keep DIR]
//
// The engine checkout needs `npm ci && npm run bootstrap` done once (its packs
// fetched). Heavy: a full system build, about the cost of `npm run bootstrap`
// plus the size of every layer; not wired into CI. What it does, all on disk
// and on loopback, never against a network registry:
//  1. stages this repository twice from `git archive HEAD` (tracked files
//     only, so no build output or editor state ends up in a layer) and builds
//     each with open-steamgate's osd-layer as `--kind pack --name osg-demo`,
//     with --source https://github.com/oisee/osg-demo@<HEAD>:.; the two tree
//     and manifest digests must be equal;
//  2. stages open-steamgate's own layers the way scripts/system-roundtrip.mjs
//     does (the locked libraries, src with its seeds and pages, test, every
//     pack of the checkout), appends the fleet pack last, and writes the
//     system as a local OCI layout: oci-layout, index.json and blobs/sha256;
//  3. makes a scratch checkout of OSD_HOME's HEAD without src, packs, data,
//     webapp and gen, installs the system with
//     `node tools/osd-fetch.mjs --system <layout>/index.json` and builds it
//     (`node tools/osd-build.mjs`, what `npm run transpile` runs), which
//     verifies every installed layer first;
//  4. checks the fleet in that system: ABAP Unit of ZCL_OSD_FLEET_REPORT
//     (node tools/osd-unit.mjs), then the engine on a throwaway database:
//     ShipSet/$count is the seed's ship count and ShipSet('S001') reads back;
//  5. checks what the system refuses: an ADT save into an installed class
//     answers ReadOnly (405 ExceptionResourceNoAccess), a build with
//     OSD_PACKS set is refused, and a build after one installed file changed
//     is refused with `run osd-fetch --system again`.
//
// test/slice.mjs and test/rap.mjs cannot point at this scratch checkout as
// they are: they set OSD_PACKS, which system mode refuses.
//
// Everything is made under one temporary directory, removed at the end (also
// on a failure or a signal) unless --keep DIR names a directory to keep it in.
// The scratch checkout links OSD_HOME's node_modules; OSD_HOME itself is read,
// never written (no .local/system appears there).
import {spawn, spawnSync} from "node:child_process";
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {createServer} from "node:net";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.OSD_HOME ? resolve(process.env.OSD_HOME) : "";
if (home === "") {
  console.error("layer: set OSD_HOME to an open-steamgate checkout");
  process.exit(2);
}
const keepAt = process.argv.indexOf("--keep");
const keep = keepAt > 0 ? resolve(process.argv[keepAt + 1] ?? "") : undefined;
const started = Date.now();
const seconds = (since) => `${((Date.now() - since) / 1000).toFixed(1)} s`;
const ships = JSON.parse(readFileSync(join(repo, "data", "zosd_fleet_ship.tabu.json"), "utf8"));

// open-steamgate's own modules, from the checkout under test
const osg = (path) => import(pathToFileURL(join(home, path)).href);
const {build} = await osg("tools/osd-layer.mjs");
const {MEDIA, sha256} = await osg("tools/osd-oci.mjs");
const {stageSystem} = await osg("scripts/system-stage.mjs");
const {readLock} = await osg("tools/osd-lock.mjs");

if (keep) mkdirSync(keep, {recursive: true});
const temp = mkdtempSync(join(keep ?? tmpdir(), "osg-layer-"));
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
  if (!keep) rmSync(temp, {recursive: true, force: true});
}
process.on("exit", stop);
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

function finish() {
  stop();
  const failed = results.filter((r) => !r.ok);
  console.log(`layer: ${results.length - failed.length} passed, ${failed.length} failed in ${seconds(started)}${keep ? `; kept ${temp}` : ""}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

// the scratch checkout runs with none of the development overrides a system refuses
const scratch = join(temp, "scratch");
const baseEnv = Object.fromEntries(Object.entries(process.env)
  .filter(([k]) => !["OSD_PACKS", "OSD_WEB_PACKS", "OSD_LAYERS", "OSD_ROOT"].includes(k) && !k.startsWith("OSD_LIB_")));
const scratchEnv = {...baseEnv, OSD_ROOT: scratch};
const node = (args, extra = {}) => spawnSync(process.execPath, args,
  {cwd: scratch, env: {...scratchEnv, ...extra}, encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
const tail = (r) => (r.stdout + r.stderr).trim().split("\n").slice(-6).join(" | ");

// 1. the fleet as a layer, twice from tracked files
const commit = spawnSync("git", ["rev-parse", "HEAD"], {cwd: repo, encoding: "utf8"}).stdout.trim();
const source = `https://github.com/oisee/osg-demo@${commit}:.`;
function stageFleet(name) {
  const dir = join(temp, name);
  mkdirSync(dir);
  const tar = spawnSync("sh", ["-c", `git -C "$1" archive HEAD | tar -x -C "$2"`, "sh", repo, dir]);
  expect(tar.status === 0, `git archive: ${tar.stderr}`);
  return build(dir, {name: "osg-demo", kind: "pack", source});
}
let fleet;
await check("1 the fleet layer builds twice to the same digests", async () => {
  const a = stageFleet("fleet-a"), b = stageFleet("fleet-b");
  expect(a.config.treeDigest === b.config.treeDigest, `treeDigest ${a.config.treeDigest} != ${b.config.treeDigest}`);
  expect(a.digest === b.digest, `manifest ${a.digest} != ${b.digest}`);
  expect(a.zip.equals(b.zip), "the two ZIPs differ");
  fleet = a;
  console.log(`      treeDigest ${a.config.treeDigest}\n      manifest   ${a.digest}\n      ${a.files.length} files, ${a.zip.length} bytes, source ${source}`);
  return `${commit.slice(0, 7)}: ${a.digest}`;
});
if (!fleet) finish();

// 2. the system: open-steamgate's layers, then the fleet, as a local OCI layout
const layout = join(temp, "layout");
let systemDigest;
await check("2 a system of open-steamgate's layers and the fleet, as an OCI layout", async () => {
  const t = Date.now();
  mkdirSync(join(layout, "blobs", "sha256"), {recursive: true});
  const blob = (bytes) => {
    const d = sha256(bytes);
    writeFileSync(join(layout, "blobs", "sha256", d.slice(7)), bytes);
    return {digest: d, size: bytes.length};
  };
  const layers = [];
  for (const staged of stageSystem(home, join(temp, "stage"))) {
    if (staged.name === "osg-demo") throw new Error("open-steamgate already has a pack called osg-demo");
    layers.push(build(staged.folder, {name: staged.name, kind: staged.kind}));
  }
  layers.push(fleet);
  let bytes = 0;
  for (const l of layers) {
    blob(l.configBytes);
    blob(l.zip);
    blob(l.manifestBytes);
    bytes += l.zip.length;
  }
  const lock = readLock(home);
  const osgCommit = spawnSync("git", ["rev-parse", "HEAD"], {cwd: home, encoding: "utf8"}).stdout.trim();
  const index = {schemaVersion: 2, mediaType: MEDIA.index, artifactType: "application/vnd.osd.system.v1",
    manifests: layers.map((l, order) => ({mediaType: MEDIA.manifest, digest: l.digest, size: l.manifestBytes.length,
      annotations: {"org.osd.layer.name": l.config.name, "org.osd.layer.kind": l.config.kind, "org.osd.layer.order": String(order)}})),
    annotations: {"org.osd.osg.commit": osgCommit, "org.osd.transpiler": `${lock.transpiler.repo}@${lock.transpiler.ref}`}};
  const system = blob(Buffer.from(JSON.stringify(index)));
  systemDigest = system.digest;
  writeFileSync(join(layout, "oci-layout"), JSON.stringify({imageLayoutVersion: "1.0.0"}));
  writeFileSync(join(layout, "index.json"), JSON.stringify({schemaVersion: 2, mediaType: MEDIA.index,
    manifests: [{mediaType: MEDIA.index, ...system, annotations: {"org.opencontainers.image.ref.name": "osg-demo"}}]}));
  for (const l of layers) console.log(`      ${l.config.kind.padEnd(5)} ${l.config.name.padEnd(20)} ${String(l.files.length).padStart(5)} files ${String(l.zip.length).padStart(10)} bytes ${l.digest}`);
  return `${systemDigest}, ${layers.length} layers, ${bytes} bytes of ZIP, in ${seconds(t)}`;
});
if (!systemDigest) finish();

// 3. a scratch checkout without src, packs, data, webapp, gen; install; build
let built = false;
await check("3 install by digest into a scratch checkout and build", async () => {
  mkdirSync(scratch);
  const tar = spawnSync("sh", ["-c", `git -C "$1" archive HEAD | tar -x -C "$2" --exclude=src --exclude=packs --exclude=data --exclude=webapp --exclude=gen`, "sh", home, scratch]);
  expect(tar.status === 0, `git archive: ${tar.stderr}`);
  symlinkSync(join(home, "node_modules"), join(scratch, "node_modules"), "dir");
  if (existsSync(join(home, ".local/transpiler.json"))) {
    mkdirSync(join(scratch, ".local"), {recursive: true});
    cpSync(join(home, ".local/transpiler.json"), join(scratch, ".local/transpiler.json"));
  }
  let t = Date.now();
  const fetched = node(["tools/osd-fetch.mjs", "--system", join(layout, "index.json")]);
  expect(fetched.status === 0, `osd-fetch --system: ${tail(fetched)}`);
  expect(fetched.stdout.includes(`system ${systemDigest}:`), `installed something else: ${tail(fetched)}`);
  const install = seconds(t);
  t = Date.now();
  const b = node(["tools/osd-build.mjs"]);
  writeFileSync(join(temp, "build.log"), b.stdout + b.stderr);
  expect(b.status === 0, `osd-build: ${tail(b)}`);
  const verified = /system layers verified: (\d+) layers, (\d+) files, (\d+) bytes in ([\d.]+) ms/.exec(b.stdout + b.stderr);
  expect(verified, "the build did not report the installed layers' verification");
  const objects = /built \w+ in \d+ ms, (\d+) objects/.exec(b.stdout + b.stderr)?.[1];
  built = true;
  return `installed in ${install}, built in ${seconds(t)} (${objects} objects); verified ${verified[1]} layers, ${verified[2]} files, ${verified[3]} bytes in ${verified[4]} ms`;
});
if (!built) finish();

// 4. the fleet inside the system
await check("4 ABAP Unit of ZCL_OSD_FLEET_REPORT", async () => {
  const unit = node(["tools/osd-unit.mjs", "CLAS", "ZCL_OSD_FLEET_REPORT"]);
  const out = unit.stdout + unit.stderr;
  expect(unit.status === 0, `exit ${unit.status}: ${tail(unit)}`);
  const summary = /ZCL_OSD_FLEET_REPORT: (.*)/.exec(out)?.[1];
  expect(summary !== undefined, `no summary line in: ${out.slice(-400)}`);
  expect(/[1-9]\d* passed, 0 failed/.test(summary), summary);
  return summary;
});

const freePort = () => new Promise((ok, fail) => {
  const probe = createServer().listen(0, "127.0.0.1", () => {
    const {port} = probe.address();
    probe.close(() => ok(port));
  }).on("error", fail);
});
const port = Number(process.env.STG_PORT || await freePort());
const base = `http://localhost:${port}`;
const odata = `${base}/sap/opu/odata/sap/ZOSD_FLEET_SRV`;
mkdirSync(join(temp, "db"));
server = spawn(process.execPath, ["test/run.mjs"], {cwd: scratch,
  env: {...scratchEnv, STG_PORT: String(port), STG_DB_PATH: join(temp, "db", "osd.sqlite")}, stdio: ["ignore", "ignore", "inherit"]});
console.log(`layer: engine PID ${server.pid} on port ${port}`);
const deadline = Date.now() + 180_000;
for (;;) {
  if (server.exitCode !== null) {
    results.push({name: "5 the engine starts", ok: false, detail: `exited with ${server.exitCode}`});
    finish();
  }
  if (await fetch(`${odata}/$metadata`).then((r) => r.ok, () => false)) break;
  if (Date.now() > deadline) {
    results.push({name: "5 the engine starts", ok: false, detail: "ZOSD_FLEET_SRV not served within 180 s"});
    finish();
  }
  await new Promise((ok) => setTimeout(ok, 1000));
}

await check("5 OData: ShipSet/$count and ShipSet('S001') from the installed seed", async () => {
  const count = await fetch(`${odata}/ShipSet/$count`).then((r) => r.text());
  expect(Number(count) === ships.length, `$count ${count}, the seed has ${ships.length}`);
  const res = await fetch(`${odata}/ShipSet('S001')`, {headers: {accept: "application/json"}});
  expect(res.ok, `ShipSet('S001'): HTTP ${res.status}`);
  const s001 = (await res.json()).d;
  const seeded = ships.find((s) => s.ship_id === "S001");
  expect(s001.Name === seeded.name, `S001 is ${s001.Name}, the seed says ${seeded.name}`);
  return `${count} ships; S001 ${s001.Name}`;
});

// 5. what the system refuses
await check("6 an ADT save into an installed class answers ReadOnly", async () => {
  const uri = `${base}/sap/bc/adt/oo/classes/zcl_osd_fleet_report/source/main`;
  const token = await fetch(`${base}/sap/bc/adt/discovery`, {headers: {"x-csrf-token": "fetch"}});
  const headers = {"x-csrf-token": token.headers.get("x-csrf-token"), cookie: token.headers.get("set-cookie") ?? ""};
  const before = await fetch(uri, {headers}).then((r) => r.text());
  const res = await fetch(uri, {method: "PUT", headers: {...headers, "content-type": "text/plain"}, body: `${before}\n* a change\n`});
  const body = await res.text();
  // the facade's ReadOnly answer (zcx_osd_adt: ReadOnly 405), before any lock is asked for
  expect(res.status === 405, `HTTP ${res.status}: ${body.slice(0, 200)}`);
  expect(body.includes(`<type id="ExceptionResourceNoAccess"/>`), `no ExceptionResourceNoAccess: ${body.slice(0, 200)}`);
  const message = /<message lang="EN">([^<]*)<\/message>/.exec(body)?.[1];
  expect(/cannot be changed here/.test(message ?? ""), `message: ${message}`);
  const file = join(scratch, ".local/system/packs/osg-demo/src/zcl_osd_fleet_report.clas.abap");
  expect(readFileSync(file, "utf8") === before, "the installed file changed");
  return `HTTP ${res.status} ExceptionResourceNoAccess: ${message}`;
});

server.kill("SIGTERM");

await check("7 a build with OSD_PACKS set is refused", async () => {
  const b = node(["tools/osd-build.mjs"], {OSD_PACKS: repo});
  expect(b.status !== 0, "the build ran");
  const line = (b.stdout + b.stderr).split("\n").find((l) => /OSD_PACKS is refused/.test(l));
  expect(line, tail(b));
  return line.trim();
});

await check("8 a build after an installed file changed is refused", async () => {
  const file = join(scratch, ".local/system/packs/osg-demo/data/zosd_fleet_ship.tabu.json");
  const original = readFileSync(file);
  writeFileSync(file, Buffer.from(original.toString("utf8").replace('"steam_pct": 100', '"steam_pct": 101')));
  try {
    const b = node(["tools/osd-build.mjs"]);
    expect(b.status !== 0, "the build ran");
    const line = (b.stdout + b.stderr).split("\n").find((l) => /run osd-fetch --system again/.test(l));
    expect(line, tail(b));
    return line.trim();
  } finally {
    writeFileSync(file, original);
  }
});

console.log(`layer: system ${systemDigest}, layout ${statSync(join(layout, "index.json")).size} bytes index`);
finish();
