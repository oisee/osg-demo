# 22. The fleet pinned by digest: OCI layers

Until now the fleet has reached open-steamgate as a folder. `OSD_PACKS`
points at this checkout, the engine reads what is there today, and
tomorrow's edit is tomorrow's system. That suits development. It does not
answer the question an operator asks: *which* code is running, and can I get
exactly that again?

open-steamgate answers it the way container images do. A **layer** is an
abapGit repository packed into a ZIP whose bytes are fixed, and published as
an OCI artifact. A **system** is an ordered list of layers: the ABAP
libraries first, open-steamgate's own sources, then the packs, each later
one overlaying the ones before. Each layer and the system as a whole are
named by a SHA-256 digest of their bytes. Install a system by its digest
and the build checks, every time, that the installed files are still the
ones the digest names
([docs/oci-layers.md](https://github.com/oisee/open-steamgate/blob/vscode-stable-v0.7.3140/docs/oci-layers.md)).

This chapter puts the fleet into such a system, installs it into a checkout
that has no sources of its own, and runs the book's checks against it.
Everything stays on your disk: the system is written as an *OCI layout*, a
folder in the format a registry serves, and nothing is pushed anywhere.
`test/layer.mjs` checks the steps below (appendix A).

## Pin the fleet

You need an open-steamgate checkout at the book's tag, with
`npm ci && npm run bootstrap` done once (appendix A), and this repository
checked out. Commands run in this repository's folder unless a step says
otherwise; `$OSD_HOME` is the open-steamgate checkout.

1. Build the system and install it:

   ```sh
   OSD_HOME=$OSD_HOME node tools/fleet-system.mjs --out /tmp/fleet-sys --install /tmp/fleet-osg
   ```

   Expected, after a few lines `osd-layer: skipping .git` (one per library,
   whose folders are git clones) and about ten seconds: a table of 17
   layers and two lines about the system.

   ```text
   order  kind  name              files     bytes  manifest digest
       0  lib   open-abap-core      808   1888001  sha256:ab69f46d05ee…
       1  lib   express-icf-shim     22    176817  sha256:51e6c827ae73…
       2  lib   open-abap-apc        74    150414  sha256:536d3fbeeb91…
       3  lib   abapgit            1563   7183220  sha256:4ae795f32d24…
       4  lib   open-abap-gui      1364   4604075  sha256:27c64e77d2a0…
       5  lib   open-abap-odata     155    482527  sha256:7dac156cbb73…
       6  lib   ajson                49    434527  sha256:b54706c18686…
       7  input src                1538  22515215  sha256:1abdd55d59c3…
       8  input test                987  10911009  sha256:408db17dd9d7…
       9  pack  o4d                 234  12777034  sha256:19c7780c1171…
      10  pack  zork                 35    204802  sha256:d1e74d162c07…
      11  pack  gui-examples          5      1549  sha256:680ee5ef2684…
      12  pack  rap-flight          472  14326791  sha256:7b701320b248…
      13  pack  lsd                  16   3797816  sha256:7b4fe40ab4ef…
      14  pack  zvdb                 33   5466696  sha256:22f3b5650ac4…
      15  pack  travels-a4h           7      7338  sha256:9b27bd86e805…
      16  pack  osg-demo            238   8443894  sha256:…
   fleet  treeDigest sha256:…  source https://github.com/oisee/osg-demo@<your commit>
   system sha256:…  17 layers, 93371725 bytes  /tmp/fleet-sys/index.json
   ```

   The first sixteen rows are open-steamgate's own layers, built from the
   tag and the libraries it pins; written with the tag, they had the
   digests shown. The last row is the fleet, and its digests are yours:
   they name the commit you have checked out (step 3 shows why). The last
   lines say the system was installed in `/tmp/fleet-osg`.

2. Look at what was installed:

   ```sh
   cd /tmp/fleet-osg
   ls
   ls .local/system .local/system/packs
   ```

   Expected: an open-steamgate checkout *without* `src`, `packs`, `data`
   or `webapp`. Its content is in `.local/system/`: `libs/`, `inputs/`
   (`src` and `test`) and `packs/`, where `osg-demo` holds only
   `osd-pack.json`, `src`, `data`, `webapp` and `voyage`. The book and its
   pictures did not come along. `.local/system/.osd-system.json` records
   the system digest and, for every layer, its order, kind, name, manifest
   digest and tree digest.

3. Same files, same digest. Back in this repository, run step 1's command
   again with `--out /tmp/fleet-sys2` and no `--install`. Expected: the
   same table and the same system digest. Now change one byte of the seed,
   say ship S002's `steam_pct` in `data/zosd_fleet_ship.tabu.json`, and run
   it a third time (`--out /tmp/fleet-sys3`). Expected: *still* the same
   digest. The layer is made from the commit, `git archive HEAD`, not from
   the files in your editor. Commit the change and run it once more: now the
   fleet's tree digest, its manifest digest and the system digest all move,
   and the sixteen rows above them stay. Undo the commit
   (`git reset --hard HEAD~1`) when you have seen it.

4. Build and start the installed system:

   ```sh
   cd /tmp/fleet-osg
   STG_PORT=8099 npm start
   ```

   Expected, before the server's usual lines: `osd-build: system layers
   verified: 17 layers, … files, … bytes in … ms` and `osd-build: built …
   3177 objects, live`. The first build takes about as long as a bootstrap;
   the verification, a few hundred milliseconds, runs on every build. Open
   the launchpad on port 8099: the **Airship fleet** and **Voyages** tiles
   are there, as in chapters 4 and 21. Stop the server.

5. Run the book's checks against it, from this repository:

   ```sh
   OSD_HOME=/tmp/fleet-osg SLICE_SKIP_UI=1 node test/slice.mjs
   OSD_HOME=/tmp/fleet-osg node test/rap.mjs
   ```

   Expected: the first line names the system and the fleet's layer
   (`slice: building /tmp/fleet-osg, system sha256:…, fleet layer
   sha256:…`), then the same checks as against a development checkout:
   slice 21 passed and 1 skipped, rap 9 passed.

6. Try to change the running code. In `/tmp/fleet-osg`:

   ```sh
   OSD_PACKS=/path/to/osg-demo npm run transpile
   ```

   Expected: `osd-build: BAD_SYSTEM: system mode: OSD_PACKS is refused; the
   system digest supplies all layers` and `osd-build: live generation
   untouched`. Then edit one installed file, for example
   `.local/system/packs/osg-demo/data/zosd_fleet_ship.tabu.json`, and run
   `npm run transpile` again. Expected: `osd-build: SYSTEM_MODIFIED: system
   layer osg-demo (pack) was modified or is unreadable; run osd-fetch
   --system again`. Put the byte back and the build runs again.

When you are done, remove `/tmp/fleet-sys*` and `/tmp/fleet-osg`.

## A layer

`tools/fleet-system.mjs` does nothing open-steamgate cannot do. It calls
`build()` of open-steamgate's `tools/osd-layer.mjs` for every layer and
writes the result where `osd-fetch` can read it. The fleet's layer is the
committed pack files and nothing else:

<!-- code: tools/fleet-system.mjs lines 25-30 -->
```js
// What the pack needs, and nothing else (not the book, not the articles).
// open-steamgate's pack discovery (tools/osd-packs.mjs, packAt) reads
// osd-pack.json and the folders it names or defaults to: the ABAP in src
// (src/ddic and src/cds included), the seed rows in data, the app in webapp
// and the BSP folder voyage. .abapgit.xml keeps STARTING_FOLDER /src/.
export const PACK_FILES = ["osd-pack.json", ".abapgit.xml", "src", "data", "voyage", "webapp"];
```

<!-- code: tools/fleet-system.mjs lines 42-49 -->
```js
/** The fleet as a pack layer: the committed pack files of HEAD, named by the commit they came from. */
export function fleetLayer(osg, dir) {
  mkdirSync(dir, {recursive: true});
  const tar = spawnSync("sh", ["-c", `git -C "$1" archive HEAD ${PACK_FILES.join(" ")} | tar -x -C "$2"`, "sh", repo, dir], {encoding: "utf8"});
  if (tar.status !== 0) throw new Error(`git archive: ${tar.stderr}`);
  const source = `https://github.com/oisee/osg-demo@${git(repo, "rev-parse", "HEAD")}:.`;
  return osg.build(dir, {name: "osg-demo", kind: "pack", source});
}
```

`build()` turns that folder into three things:

- **The ZIP.** Its entries are *stored*, not compressed, sorted by path,
  dated 1980-01-01, with no extra fields. The same files always give the
  same bytes, on Node and on Bun. abapGit reads such a ZIP as it reads any
  other.
- **The config**, a small JSON: `{"schema":1,"name":"osg-demo","kind":"pack",
  "treeDigest":"sha256:…","source":{"repo":"https://github.com/oisee/osg-demo",
  "commit":"…","path":"."}}`. The *tree digest* is a SHA-256 over one line
  per file: the file's own SHA-256 and its path, sorted by path. It says
  "these files", whatever ZIP carries them.
- **The manifest**, an OCI image manifest of artifact type
  `application/vnd.osd.layer.v1` that names the config and the ZIP by their
  digests. The manifest's own digest is the layer's name: the pin.

Each digest covers the one below it. That is why step 3 behaved as it did.
A changed seed byte changed the ZIP, so the tree digest, so the config, so
the manifest. A commit that touches only `book/` leaves the ZIP and the
tree digest alone, but the config names the commit, so the manifest moves.
The tree digest says *same fleet*; the manifest digest says *this fleet,
from this commit*.

Kinds are `lib`, `input`, `pack` and `customer`. The fleet is a pack:
it brings ABAP, seed rows, tiles and apps, exactly what `OSD_PACKS` used to
bring from the folder.

## A system

The system is an OCI image index of artifact type
`application/vnd.osd.system.v1`: the layer manifests in order, each with
its name, kind and order as annotations, and two annotations for the whole,
the open-steamgate commit and the transpiler pin it was built with:

<!-- code: tools/fleet-system.mjs lines 73-79 -->
```js
const lock = osg.readLock(osg.home);
const system = blob(Buffer.from(JSON.stringify({
  schemaVersion: 2, mediaType: osg.MEDIA.index, artifactType: "application/vnd.osd.system.v1",
  manifests: layers.map((l, order) => ({mediaType: osg.MEDIA.manifest, digest: l.digest, size: l.manifestBytes.length,
    annotations: {"org.osd.layer.name": l.config.name, "org.osd.layer.kind": l.config.kind, "org.osd.layer.order": String(order)}})),
  annotations: {"org.osd.osg.commit": git(osg.home, "rev-parse", "HEAD"), "org.osd.transpiler": `${lock.transpiler.repo}@${lock.transpiler.ref}`},
})));
```

Order matters: a later layer wins. If the fleet had a class of the same
name as one in `src`, the fleet's would be built and the build would name
both paths. The fleet comes last, after open-steamgate's own packs.

`/tmp/fleet-sys` is an OCI layout: `oci-layout`, the blobs under
`blobs/sha256/<hex>` (config, ZIP and manifest of every layer, and the
system index), and an `index.json` that points at the system. A registry
serves the same blobs over HTTP. `osd-fetch --system` takes either a
registry reference pinned by digest (`ghcr.io/…@sha256:…`, never a tag) or
such an `index.json`. Either way it checks every blob against the digest and
size its parent names, the order annotations, each ZIP's canonical form and
each layer's tree digest, then unpacks into a staging folder and renames it
to `.local/system/` only when everything has passed. A failure leaves the
previous installation as it was.

## What a pinned system refuses

A system checkout reads nothing but its layers. The checkout's own `src`
and `test` are ignored; libraries come from `libs/`, sources from
`inputs/`, packs from `packs/`, and `gen/` is generated from them on every
build. Everything that would let something else in is refused:
`OSD_PACKS`, `OSD_WEB_PACKS`, `OSD_LAYERS`, any `OSD_LIB_*`, a `$TMP`
layer. Before a build uses anything, it walks every installed layer again
and compares its tree digest:

From open-steamgate's
[tools/osd-system-verify.mjs](https://github.com/oisee/open-steamgate/blob/vscode-stable-v0.7.3140/tools/osd-system-verify.mjs):

```js
      if (treeDigest(entries) !== layer.treeDigest) throw new Error("treeDigest differs");
    } catch (cause) {
      const error = new Error(`system layer ${layer.name} (${layer.kind}) was modified or is unreadable; run osd-fetch --system again`, {cause});
      error.code = "SYSTEM_MODIFIED";
      throw error;
    }
  }
```

There is no bypass for development: to change the code, change the
repository, commit, and install the new digest.

The workbench is told the same thing. Over ADT, a lock on an installed
class answers with an empty lock handle, which a client reads as "not
modifiable", and a save answers `405` with
`CLAS ZCL_OSD_FLEET_REPORT is a library object and cannot be changed here`.
Creating an object in `$TMP` is refused too: in system mode `$TMP` has
nowhere to write.

One more refusal guards the other direction. A layer built with
`--private` (code that must not leave the company) may be pushed only to a
registry listed in `OSD_PRIVATE_REGISTRIES`, and never to `ghcr.io` or a
GitHub Pages host, listed or not. In the open-steamgate checkout:

```sh
node tools/osd-layer.mjs push ghcr.io/example/osd/osg-demo:try ../osg-demo --name osg-demo --kind pack --private
```

Expected: `osd-layer: PRIVATE_LAYER: private layer osg-demo cannot be
published to ghcr.io`, exit code 2. The check is a comparison of names,
made after the local build and before any connection is opened.

## The checks in both modes

`test/slice.mjs` and `test/rap.mjs` used to set `OSD_PACKS` to this
checkout, so a system checkout refused them. They now ask one small module
which mode `OSD_HOME` is in:

<!-- code: test/engine.mjs lines 20-26 -->
```js
/** The environment to build and serve with: this repository as a pack, or the system as it is installed. */
export function engineEnv(home, repo, extra = {}) {
  const env = {...process.env, ...extra};
  if (installedSystem(home)) delete env.OSD_PACKS;
  else env.OSD_PACKS = repo;
  return env;
}
```

In a development checkout nothing changed. In a system checkout the
fleet is whatever the system's `osg-demo` layer holds, and the first line
of each check names that layer's digest, so a green run says *which* fleet
was green. When a build fails, the checks print what `osd-build` printed:
it writes its refusals to standard output.

## What this does not do

- **No live data.** A system is code, seed rows and pages. The rows your
  users wrote are in the database, not in a layer, and installing a new
  digest neither takes nor restores them.
- **No registry here.** This chapter writes the layout to disk. Pushing
  it is `osd-layer push` and `osd-layer system push` from the open-steamgate
  checkout. Every push runs a leak gate first, which needs an identifier
  list in `.local/leak-identifiers.json` and refuses without one. The
  tag's own release workflow publishes open-steamgate's layers and a
  system to `ghcr.io/oisee/open-steamgate`; for `vscode-stable-v0.7.3140`
  that gate stopped the publication, so the last published system is that
  of `vscode-v0.7.2382`, without the fleet and from another commit.
- **No layout writer in open-steamgate.** `osd-fetch --system` reads a
  local layout, but at this tag `osd-layer` writes layers to folders and
  systems only to registries. `tools/fleet-system.mjs` fills the gap with
  open-steamgate's own `build()` and the recipe of its
  `scripts/system-roundtrip.mjs`.
- **A system is not a snapshot of a running server.** It pins what the
  build reads. The open-steamgate commit that runs it is recorded in the
  annotations; a different one prints a warning and is allowed.

`test/layer.mjs` repeats this chapter in about a minute and a half: the
fleet's layer built twice to the same digests, the layout written, the
system installed into a temporary checkout and built, an ABAP Unit test and
an OData read of the fleet there, the ADT save refused, `OSD_PACKS` refused,
and an edited installed file refused. It is heavy and not part of CI.
