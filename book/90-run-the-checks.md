# Appendix A. Run the checks

In an open-steamgate checkout, run `npm ci && npm run bootstrap` once (bootstrap builds and links the transpiler the checkout pins). Then `OSD_HOME=/path/to/open-steamgate node test/slice.mjs` builds that engine checkout with this folder as a pack, starts it on a free port and checks the Airship fleet end to end: six ships in `ShipSet`, the fleet report's classrun, a `$filter` on status, a MERGE that reads back, the launchpad tile opening the list report (this one needs a browser that reaches ui5.sap.com; `SLICE_SKIP_UI=1` skips it and says so, `SLICE_CHROMIUM=<path>` picks the browser), and the report's ABAP Unit test. It stops the engine it started, and exits non-zero if any check fails. `OSD_HOME=/path/to/open-steamgate node test/jobs.mjs` checks the background jobs the same way on a temporary SQLite file: the single job with its BAL log, and both chains (the good one completes, the failing one leaves readiness waiting).

`OSD_HOME=/path/to/open-steamgate node test/lift.mjs` checks that the generated
region of `ZCL_OSD_FLEET_LIFT=>AFTER` is what the lift recipe renders from
`BEFORE` (chapter 11); `--write` regenerates it. Slice check 16 runs it too.

`OSD_HOME` may also be a checkout with an installed system (chapter 22,
`tools/fleet-system.mjs --install`). Then `test/slice.mjs` and `test/rap.mjs`
do not set `OSD_PACKS`, which such a checkout refuses: the fleet is the
system's `osg-demo` layer, and the first line names its digest.

| Script | Checks | Backends | In CI |
|---|---|---|---|
| `test/slice.mjs` | 22: tables and seed, F8 preview, classruns, the BAL audit, the service tree, OData, the tile (UI, skippable), unit tests, a dump, the zip, AMDP, both ALV grids, the template report, the lift, the L2 rule and its 15 generated tests | SQLite, DuckDB | yes, both, with the UI check skipped |
| `test/jobs.mjs` | 7: one job, both chains, the doctor | SQLite file | yes |
| `test/l3.mjs` | 7: chapter 16's night set in one step, in jobs through the worker (seven jobs, the gate between the stages), its state, the schedule switched on and off; chapter 17's watch set stopping at its glass and continued with a reason; daemon start, pause at glass and stop; `--print` shows the classruns' output | SQLite file | yes, last |
| `test/iti.mjs` | 2: chapter 18's C, compiled natively (when `cc` is there), prints `iti/mandel.expected.txt`; the classrun of the class abapiti made from it prints the same | SQLite file | yes |
| `test/rap.mjs` | 9: chapter 21's voyage object: the EML class's ABAP Unit (3 tests), the V4 model with its draft actions, the seeded voyages and their steam, a draft with a stop through Prepare and Activate, Approve, an unknown ship refused with nothing written, the same instances over V2, the rows removed again, and the Voyages app from its tile (browser; `SLICE_SKIP_UI=1` skips it) | SQLite or DuckDB file | yes, without the browser check |
| `test/layer.mjs` | 8: chapter 22: the fleet's layer built twice to the same digests, open-steamgate's layers and the fleet written as a local OCI layout, installed by digest into a temporary checkout and built, an ABAP Unit test and an OData read there, an ADT save refused, `OSD_PACKS` refused, an edited installed file refused; about 1.5 minutes | SQLite | no, run by hand |
| `test/lift.mjs` | the lifted region is in step with its recipe | any | through slice check 16 |
| `test/l2.mjs` | the L2 rule's class, v1 traces and metadata are what the rule builds to (`--write` rebuilds) | any | through slice check 17 |
| `test/cli.mjs` | builds the fleet's command line program with osabap (Go 1.26) and runs chapter 14's steps as checks | SQLite file | yes |
| `test/book-snippets.mjs` | every code excerpt in the book equals its source in `src/` (`--write` refreshes them) | none needed | yes, first step |
| `test/book-shots.mjs` | retakes the screenshots in `book/img/` from a running engine | SQLite | no, run by hand |
| `test/cli-shots.mjs` | retakes chapter 14's terminal and TUI pictures from the program `test/cli.mjs --keep` left | SQLite file | no, run by hand |
| `test/l3-diagrams.mjs` | redraws the diagrams of chapters 16 and 17, English and Russian | none needed (Chromium from the checkout) | no, run by hand |
| `test/iti-diagram.mjs` | redraws chapter 18's picture, English and Russian | none needed (Chromium from the checkout) | no, run by hand |
| `test/vscode-shots.mjs` | retakes the VS Code pictures of chapters 1, 2 and 15: VS Code and the released extension under Xvfb, each picture taken once its state is on screen | SQLite | no, run by hand |
| `test/web-shots.mjs` | chapter 23 in `@vscode/test-web` (steps 6 to 9) with its pictures: the worker's first `$metadata`, the OSD view, F8, a notebook cell, the launchpad's content packs, the Airship fleet list, a write that survives a reload, the greyed tiles; the V4 steps are known failures of the tag, and one that starts to pass fails the run so the chapter is corrected; needs a web bundle built with this pack | sql.js in the browser | no, run by hand |
| `test/web-vscodedev.mjs` | chapter 23 in the real vscode.dev, no account: `marketplace` (steps 1 to 4) or `location https://localhost:5000` (step 11) | sql.js in the browser | no, run by hand |

