# Plan: Airship fleet, first joint slice

Handover plan for an agent (cloud Claude or local codex). The work was
frozen on 2026-09-27 for budget reasons. It is in three parts, in this
order. **Delete this file in the final PR of part B.**

Repositories:
- engine: https://github.com/oisee/open-steamgate
- demo: https://github.com/oisee/osg-demo (this repository)

Rules for the agent:
- Nothing is merged by the agent; Alice or dell merges.
- No force-push over somebody else's work.
- Never commit report or log files (REPORT.md, REVIEW*.md, *.log, TASK.md).
- Kill only processes you started (no `pkill -f`).
- ABAP source is 7-bit ASCII, 7.02 syntax.
- No live identifiers (host names, users, IPs, customer names) in any file.
- Every new test file in the **engine** goes into `test/suites.json`.
- Before a PR, a separate critic pass reads the diff against this plan and
  the contract. Fix what it flags, then open the PR.

---

## Part A — engine: open the PR for the pack-app manifest rebase

Branch `fix/pack-app-manifest-rebase` in open-steamgate, one commit,
"Rebase pack BSP manifests per OData source". It is finished and reviewed
(critic verdict ok, 60 mocha passing), but no PR exists yet.

What it fixes:
- A pack's `webapp/manifest.json` became its BSP application byte for byte.
- A pack manifest written for `/app/<pack>/` says
  `../../sap/opu/odata/sap/<SRV>/`. Served from
  `/sap/bc/ui5_ui5/sap/<app>/`, that URI reaches nothing.
- Declared apps (`src/bsp/apps.json`) were already rebased through
  `manifestFor`. Now pack apps and the abapGit zip path rebase each OData
  dataSource by its own service name to `../../../../opu/odata/sap/<SRV>/`.
- Files: `tools/osd-bsp-app.mjs`, `tools/osd-bsp-registry.mjs`,
  `tools/osd-abapgit-zip.mjs`, tests in `test/osd-packs.mjs` and
  `test/osd-abapgit-zip.mjs`, one sentence in `docs/vscode-extension.md`.

Steps:
1. Rebase on `origin/main` (if a conflict is not trivial, stop and report).
   Run:
   - `npx mocha test/osd-packs.mjs test/osd-abapgit-zip.mjs`;
   - `npm run leak` (needs `.local/leak-identifiers.json`; without it, say
     so instead of claiming the scan).
2. Optional nit from the critic: wrap the new sentence in
   `docs/vscode-extension.md` to the line length around it.
3. Open the PR against `main`:
   - body written from the diff, not from memory;
   - state that the failing-before assertion is the generated pack page
     keeping `../../sap/opu/odata/sap/FIRST_SRV/`.

Why first: without it the fleet tile in part B opens an app that loads no
data.

---

## Part B — osg-demo: the first joint slice

Branch `feat/fleet-slice` in osg-demo (this branch).

**The contract is `docs/fleet-contract.md`** (merged in osg-demo#1). Names,
keys and shapes there are fixed. If something in it cannot work, stop and
say why; do not change it silently. The slice is its section
"First joint slice" and nothing more.

### Engine checkout to run against

```
git clone https://github.com/oisee/open-steamgate osd && cd osd
git switch fix/pack-app-manifest-rebase   # or main, once part A is merged
npm ci
npm run transpile                         # clones the ABAP libs pinned in libs.lock.json
```

Do not edit tracked engine files. If the engine is wrong, write it down as
an engine issue in the PR body.

Read in the engine first:
- `CLAUDE.md`;
- `docs/stg-compile.md`, and `src/demo/zstg_demo.stg.yaml` as the working
  example of every YAML shape used here;
- `tools/osd-packs.mjs` (what a pack is, `osd-pack.json` fields, tile);
- `docs/vscode-extension.md` (workspace packs, W1);
- `test/seed.mjs` (TABU JSON seeding, pack-owned tables replaced at start).

### What to build (in this repository)

1. **DDIC.** Tables `ZOSD_FLEET_SHIP`, `ZOSD_FLEET_VOY` and
   `ZOSD_FLEET_STAT` as abapGit TABL XML, with whatever DTEL/DOMA the engine
   needs; copy the shape of the engine's own tables under `src/`.
   Elementary search help `ZOSD_FLEET_STATUS_SH` over `ZOSD_FLEET_STAT`.
   It must be elementary, because a collective one is skipped; see
   `tools/segw-shlp.mjs`.
2. **Seed.** `data/zosd_fleet_*.tabu.json`, per the contract's Seed section:
   - 6 ships, 20 voyages, 3 statuses;
   - `MANDT` `123`, ISO dates;
   - fictional names only.
3. **ABAP.**
   - `ZCL_OSD_FLEET_REPORT`:
     - `if_oo_adt_classrun`;
     - `ship_lines( )`;
     - `steam_check` with `ASSERT steam_pct >= 0`.
   - Test class `ltcl_fleet`:
     - `counts_voyages`;
     - `broken_on_purpose`, commented out.
4. **OData.** `src/zosd_fleet.stg.yaml` per the contract:
   - `field:` on every property whose DDIC name has an underscore;
   - types `String(n)` / `Int32` / `Date`;
   - annotations (header, selectionFields, lineItem, the voyages facet);
   - `Ship/Status` with ValueList to `StatusVHSet` (`inOut` and
     `displayOnly`) and `text: {path: StatusText, arrangement: TextFirst}`;
   - `StatusVHSet` mapped to the search help for both `read` and `query`.

   Hand-written `ZCL_ZOSD_FLEET_DPC_EXT` only for:
   - filling `Ship.StatusText` from `ZOSD_FLEET_STAT`;
   - the `Ship/Voyages` navigation, filtering `VOYAGE` by the parent
     `SHIP_ID`. Two `table:` sources get no navigation filter from the
     engine yet.
5. **App.** `webapp/` holds a Fiori Elements V2 list report plus object page
   over `ZOSD_FLEET_SRV`:
   - the same bootstrap as the engine's `webapp/` (SAPUI5 from the CDN, no
     local annotation file);
   - the dataSource URI relative for `/app/<pack>/`, as the engine's pack
     apps do (`../../sap/opu/odata/sap/ZOSD_FLEET_SRV/`);
   - inbound `AirshipFleet-display`;
   - in `osd-pack.json`, a `tile` "Airship fleet" with URL
     `/app/flp.html#AirshipFleet-display`;
   - no icons or images.
6. **Out of the slice:** transaction `ZOSD_FLEET`, the function imports
   `Launch`/`Dock`, APC, cube, AMDP, export.

### Checks (this repository, `test/`)

`test/slice.mjs`, run as
`OSD_HOME=<engine checkout> node test/slice.mjs` (add an npm script if a
`package.json` is added):
1. Build the engine with this folder as a pack: `OSD_PACKS=<this repo>`,
   then `npm run transpile` in `OSD_HOME`.
2. Start the engine on a free port (`STG_PORT`), keep its PID, stop only
   that PID at the end, also on failure.
3. Make exactly the four assertions of the contract:
   - `GET .../ZOSD_FLEET_SRV/ShipSet?$format=json` returns 6 entries;
   - `POST /sap/bc/adt/oo/classrun/ZCL_OSD_FLEET_REPORT` returns plain
     text containing a line for `S001` (fetch a CSRF token first if the
     route asks for one);
   - `ShipSet?$filter=Status eq 'A'` returns exactly the aloft ships of the
     seed, compared to the seed file rather than to a hard-coded number;
   - Playwright (from the engine's `node_modules`): open
     `/app/flp.html#AirshipFleet-display` through the tile, and the list
     report shows 6 rows. Assert row texts (ship names), not only a count.
     The page must load data; a list with 0 rows and an error in the
     console is a failure.
4. ABAP Unit of the pack passes (the engine runs pack tests in
   `npm run unit`).
5. Guard against false greens:
   - a check that could pass against a stale build must not (rebuild first);
   - a check that simulates the path instead of calling it does not count.

README: add one short paragraph "Run the checks" and touch nothing else.
dell is writing the install section in a separate PR.

### Done means

- `node test/slice.mjs` green locally, with the output quoted in the PR.
- abaplint of the pack is clean, if the engine lints packs.
- The leak scan was run on the new files:
  `node <engine>/tools/osd-leak-scan.mjs --paths <files>` from the engine
  directory.
- A critic pass happened, and its findings are fixed.
- The PR is opened against osg-demo `main`, this PLAN.md is removed in it,
  and part A is named as a dependency.

---

## Part C — engine: S2c1, launchpad + Travels in a vscode.dev webview

Branch `feat/web-launchpad-travels` in open-steamgate. **Work in progress,
unreviewed:** a codex run was interrupted by the freeze. The WIP commit
touches:
- `editors/vscode/web/extension.mjs` (+161 lines);
- `scripts/build-vscode-web.mjs`;
- `scripts/test-web-probe.mjs`;
- `docs/vscode-web.md`.

It was started before #165 was merged, so rebase it on `origin/main` first.

Goal (Alice's test on her Mac): in the web extension, a command
"osd: Open launchpad" opens a webview with the launchpad. Clicking the
Travels tile shows the Travels list report, with rows from the in-worker
gateway.
- Serve the app files (`webapp/flp.html`, the apps' `webapp/`,
  `packs.json`) from the extension bundle into the webview. SAPUI5 comes
  from the CDN; set the webview CSP accordingly.
- Route all gateway traffic inside the webview through the #165 transport
  (`osdBridge.fetch`): an XHR/fetch shim installed before UI5 boots. It
  forwards the virtual gateway paths (`$metadata`, `$batch`, CSRF) and
  passes the CDN through unchanged. Resolve relative URLs against a virtual
  origin.
- APC/WebSocket is out of scope: an explicit "not available in the web
  version" state.
- Gate: `npm run web:vscode:test` (headless `@vscode/test-web` in
  Chromium). The launchpad renders, the Travels tile opens, and the list
  shows the seeded Travel rows (assert row texts).
- Document in `docs/vscode-web.md` how to run it on a Mac:
  `npx @vscode/test-web ...`, then "osd: Open launchpad".
- Known trap: after `web:vscode` (a core+zork profile) the checkout's
  generation lacks other packs' tables. Run a full `npm run transpile`
  before mocha suites such as `test/osd-data.mjs`.

Parts A and B are independent of C.
