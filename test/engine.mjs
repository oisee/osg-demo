// Which open-steamgate the book's checks run against, and how to build it.
//
// OSD_HOME is one of two things:
//  - a development checkout: this repository joins it as a pack, through
//    OSD_PACKS=<this repository>;
//  - an installed system (chapter 22; `.local/system/.osd-system.json` is
//    there, e.g. made by tools/fleet-system.mjs --install): the system's
//    digest supplies every layer, the fleet included, and the build refuses
//    OSD_PACKS.
import {spawnSync} from "node:child_process";
import {existsSync, readFileSync} from "node:fs";
import {join} from "node:path";

/** The installed system's record, or undefined in a development checkout. */
export function installedSystem(home) {
  const file = join(home, ".local/system/.osd-system.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}

/** The environment to build and serve with: this repository as a pack, or the system as it is installed. */
export function engineEnv(home, repo, extra = {}) {
  const env = {...process.env, ...extra};
  if (installedSystem(home)) delete env.OSD_PACKS;
  else env.OSD_PACKS = repo;
  return env;
}

/** Where a locked library's files are: .local/lars/<name>, or its layer in the installed system. */
export function libraryDir(home, name) {
  const system = installedSystem(home);
  if (!system) return join(home, ".local/lars", name);
  const layer = system.layers.find((l) => l.kind === "lib" && l.name === name);
  if (!layer) throw new Error(`the system installed in ${home} has no library ${name}`);
  return join(home, ".local/system", layer.path);
}

/** Says what is being built; refuses a system that does not carry the fleet. */
export function describeEngine(label, home, repo) {
  const system = installedSystem(home);
  if (!system) {
    console.log(`${label}: building ${home} with OSD_PACKS=${repo}`);
    return;
  }
  const fleet = system.layers.find((l) => l.kind === "pack" && l.name === "osg-demo");
  if (!fleet) {
    console.error(`${label}: the system ${system.digest} installed in ${home} has no osg-demo pack`);
    process.exit(1);
  }
  console.log(`${label}: building ${home}, system ${system.digest}, fleet layer ${fleet.digest}`);
}

/** `npm run transpile` in OSD_HOME. osd-build writes its refusals to stdout, so a failed build shows it. */
export function transpile(label, home, env) {
  const build = spawnSync("npm", ["run", "-s", "transpile"],
    {cwd: home, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 256 * 1024 * 1024});
  if (build.status !== 0) {
    console.error((build.stdout ?? "").trim().split("\n").slice(-40).join("\n"));
    console.error(`${label}: npm run transpile failed (${build.status})`);
    process.exit(1);
  }
}
