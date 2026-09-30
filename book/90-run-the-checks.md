# Appendix A. Run the checks

In an open-steamgate checkout, run `npm install && npm run bootstrap` once. Then `OSD_HOME=/path/to/open-steamgate node test/slice.mjs` builds that engine checkout with this folder as a pack, starts it on a free port and checks the Airship fleet end to end: six ships in `ShipSet`, the fleet report's classrun, a `$filter` on status, a MERGE that reads back, the launchpad tile opening the list report (this one needs a browser that reaches ui5.sap.com; `SLICE_SKIP_UI=1` skips it and says so, `SLICE_CHROMIUM=<path>` picks the browser), and the report's ABAP Unit test. Use the engine's main branch at `0ba17ed` or later: the tile opens the app through the launchpad intent, which older engines do not resolve for a pack. It stops the engine it started, and exits non-zero if any check fails. `OSD_HOME=/path/to/open-steamgate node test/jobs.mjs` checks the background jobs the same way on a temporary SQLite file: the single job with its BAL log, and both chains (the good one completes, the failing one leaves readiness waiting).

`OSD_HOME=/path/to/open-steamgate node test/lift.mjs` checks that the generated
region of `ZCL_OSD_FLEET_LIFT=>AFTER` is what the lift recipe renders from
`BEFORE` (chapter 11); `--write` regenerates it. Slice check 16 runs it too.

| Script | Checks | Backends | In CI |
|---|---|---|---|
| `test/slice.mjs` | 21: tables and seed, F8 preview, classruns, OData, the tile (UI, skippable), unit tests, a dump, the zip, AMDP, both ALV grids, the template report, the lift | SQLite, DuckDB | yes, both |
| `test/jobs.mjs` | 7: one job, both chains, the doctor | SQLite file | yes |
| `test/lift.mjs` | the lifted region is in step with its recipe | any | through slice check 16 |

