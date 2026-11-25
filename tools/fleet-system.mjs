#!/usr/bin/env node
// The fleet in a system pinned by digest (book chapter 24).
//
//   OSD_HOME=<open-steamgate checkout> node tools/fleet-system.mjs --out <dir> [--install <scratch>]
//
// Builds a system out of open-steamgate's own layers and this repository's
// pack, and writes it to <dir> as a local OCI layout (oci-layout,
// blobs/sha256, index.json). No registry is involved. With --install it
// also makes <scratch>, a copy of OSD_HOME's checkout without its own
// content, and installs the system there by digest:
// `node tools/osd-fetch.mjs --system <dir>/index.json`.
//
// OSD_HOME needs `npm ci && npm run bootstrap` done once (its libraries and
// packs fetched). Only open-steamgate's own modules do the work: build() of
// tools/osd-layer.mjs makes each layer, stageSystem() of
// scripts/system-stage.mjs says which layers open-steamgate has.
import {spawnSync} from "node:child_process";
import {cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// What the pack needs, and nothing else (not the book, not the articles).
// open-steamgate's pack discovery (tools/osd-packs.mjs, packAt) reads
// osd-pack.json and the folders it names or defaults to: the ABAP in src
// (src/ddic and src/cds included), the seed rows in data, the app in webapp
// and the BSP folder voyage. .abapgit.xml keeps STARTING_FOLDER /src/.
export const PACK_FILES = ["osd-pack.json", ".abapgit.xml", "src", "data", "voyage", "webapp"];

/** open-steamgate's own modules, from the checkout at `home`. */
export async function openSteamgate(home) {
  const load = (path) => import(pathToFileURL(join(home, path)).href);
  const [{build}, {MEDIA, sha256}, {stageSystem}, {readLock}] = await Promise.all([
    load("tools/osd-layer.mjs"), load("tools/osd-oci.mjs"), load("scripts/system-stage.mjs"), load("tools/osd-lock.mjs")]);
  return {home, build, MEDIA, sha256, stageSystem, readLock};
}

const git = (cwd, ...args) => spawnSync("git", args, {cwd, encoding: "utf8"}).stdout.trim();

/** The fleet as a pack layer: the committed pack files of HEAD, named by the commit they came from. */
export function fleetLayer(osg, dir) {
  mkdirSync(dir, {recursive: true});
  const tar = spawnSync("sh", ["-c", `git -C "$1" archive HEAD ${PACK_FILES.join(" ")} | tar -x -C "$2"`, "sh", repo, dir], {encoding: "utf8"});
  if (tar.status !== 0) throw new Error(`git archive: ${tar.stderr}`);
  const source = `https://github.com/oisee/osg-demo@${git(repo, "rev-parse", "HEAD")}:.`;
  return osg.build(dir, {name: "osg-demo", kind: "pack", source});
}

/** open-steamgate's layers in their order, the way its roundtrip stages them, then the fleet last. */
export function systemLayers(osg, stage, fleet) {
  const layers = [];
  for (const staged of osg.stageSystem(osg.home, stage)) {
    if (staged.name === fleet.config.name) throw new Error(`open-steamgate already has a pack called ${staged.name}`);
    layers.push(osg.build(staged.folder, {name: staged.name, kind: staged.kind}));
  }
  return [...layers, fleet];
}

/** Writes the layers and the system index as an OCI layout in `out`; returns the system digest. */
export function writeLayout(osg, layers, out) {
  mkdirSync(join(out, "blobs", "sha256"), {recursive: true});
  const blob = (bytes) => {
    const digest = osg.sha256(bytes);
    writeFileSync(join(out, "blobs", "sha256", digest.slice("sha256:".length)), bytes);
    return {digest, size: bytes.length};
  };
  // each layer: its config, its ZIP and the manifest naming both
  for (const l of layers) [l.configBytes, l.zip, l.manifestBytes].forEach(blob);
  // the system: an index of the layer manifests, in order, with the
  // open-steamgate commit and the transpiler pin it was built for
  const lock = osg.readLock(osg.home);
  const system = blob(Buffer.from(JSON.stringify({
    schemaVersion: 2, mediaType: osg.MEDIA.index, artifactType: "application/vnd.osd.system.v1",
    manifests: layers.map((l, order) => ({mediaType: osg.MEDIA.manifest, digest: l.digest, size: l.manifestBytes.length,
      annotations: {"org.osd.layer.name": l.config.name, "org.osd.layer.kind": l.config.kind, "org.osd.layer.order": String(order)}})),
    annotations: {"org.osd.osg.commit": git(osg.home, "rev-parse", "HEAD"), "org.osd.transpiler": `${lock.transpiler.repo}@${lock.transpiler.ref}`},
  })));
  // the layout's own index points at the system index; osd-fetch --system follows it one level
  writeFileSync(join(out, "oci-layout"), JSON.stringify({imageLayoutVersion: "1.0.0"}));
  writeFileSync(join(out, "index.json"), JSON.stringify({schemaVersion: 2, mediaType: osg.MEDIA.index,
    manifests: [{mediaType: osg.MEDIA.index, ...system, annotations: {"org.opencontainers.image.ref.name": "osg-demo"}}]}));
  return system.digest;
}

/** The environment a system checkout runs with: none of the development overrides it refuses. */
export function systemEnv(scratch, env = process.env) {
  const kept = Object.entries(env).filter(([k]) => !["OSD_PACKS", "OSD_WEB_PACKS", "OSD_LAYERS", "OSD_ROOT"].includes(k) && !k.startsWith("OSD_LIB_"));
  return {...Object.fromEntries(kept), OSD_ROOT: scratch};
}

/** A scratch checkout of OSD_HOME's HEAD without its own content, with the system installed by digest. */
export function install(home, layout, scratch) {
  mkdirSync(scratch, {recursive: true});
  // the recipe of open-steamgate's scripts/system-roundtrip.mjs: no src,
  // packs, data, webapp or gen -- the system supplies them
  const tar = spawnSync("sh", ["-c", `git -C "$1" archive HEAD | tar -x -C "$2" --exclude=src --exclude=packs --exclude=data --exclude=webapp --exclude=gen`,
    "sh", home, scratch], {encoding: "utf8"});
  if (tar.status !== 0) throw new Error(`git archive: ${tar.stderr}`);
  symlinkSync(join(home, "node_modules"), join(scratch, "node_modules"), "dir");
  if (existsSync(join(home, ".local/transpiler.json"))) {
    mkdirSync(join(scratch, ".local"), {recursive: true});
    cpSync(join(home, ".local/transpiler.json"), join(scratch, ".local/transpiler.json"));
  }
  return spawnSync(process.execPath, ["tools/osd-fetch.mjs", "--system", join(layout, "index.json")],
    {cwd: scratch, env: systemEnv(scratch), encoding: "utf8"});
}

const emptyOrAbsent = (dir) => !existsSync(dir) || readdirSync(dir).length === 0;

// run as a script
if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const arg = (name) => {
    const at = process.argv.indexOf(name);
    return at > 0 && process.argv[at + 1] ? resolve(process.argv[at + 1]) : undefined;
  };
  const home = process.env.OSD_HOME ? resolve(process.env.OSD_HOME) : undefined;
  const out = arg("--out"), scratch = arg("--install");
  if (!home || !out) {
    console.error("usage: OSD_HOME=<open-steamgate checkout> node tools/fleet-system.mjs --out <dir> [--install <scratch>]");
    process.exit(2);
  }
  for (const dir of [out, scratch].filter(Boolean)) {
    if (!emptyOrAbsent(dir)) {
      console.error(`fleet-system: ${dir} is not empty`);
      process.exit(2);
    }
  }

  const osg = await openSteamgate(home);
  const temp = mkdtempSync(join(tmpdir(), "fleet-system-"));
  let digest, layers;
  try {
    const fleet = fleetLayer(osg, join(temp, "fleet"));
    layers = systemLayers(osg, join(temp, "stage"), fleet);
    digest = writeLayout(osg, layers, out);
  } finally {
    rmSync(temp, {recursive: true, force: true});
  }

  // the table: one row per layer, in the order the system layers them
  const row = (...c) => `${c[0].padStart(5)}  ${c[1].padEnd(5)} ${c[2].padEnd(17)} ${c[3].padStart(5)} ${c[4].padStart(9)}  ${c[5]}`;
  console.log(row("order", "kind", "name", "files", "bytes", "manifest digest"));
  layers.forEach((l, order) => console.log(row(String(order), l.config.kind, l.config.name,
    String(l.files.length), String(l.zip.length), l.digest)));
  const fleet = layers.at(-1);
  console.log(`fleet  treeDigest ${fleet.config.treeDigest}  source ${fleet.config.source.repo}@${fleet.config.source.commit}`);
  console.log(`system ${digest}  ${layers.length} layers, ${layers.reduce((n, l) => n + l.zip.length, 0)} bytes  ${join(out, "index.json")}`);

  if (scratch) {
    const fetched = install(home, out, scratch);
    process.stdout.write(fetched.stdout);
    process.stderr.write(fetched.stderr);
    if (fetched.status !== 0) {
      console.error(`fleet-system: osd-fetch --system failed (${fetched.status})`);
      process.exit(1);
    }
    console.log(`installed in ${scratch}; next: cd ${scratch} && npm start (builds, then serves)`);
  }
}
