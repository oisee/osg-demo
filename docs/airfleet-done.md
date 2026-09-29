# airfleet: done (2026-09-27 to 2026-09-29)

A marker, not a chapter. The osg-demo work of the session "airfleet", all of
it merged into `main`; this branch starts at `main` as of 0d96917 (after
#19), so later changes by others are included and not described here.

## Merged

| PR | What | Verified | Not verified |
|---|---|---|---|
| #3 | First slice: tables, seed, `ZCL_OSD_FLEET_REPORT`, `ZOSD_FLEET_SRV` (Ship in the DPC_EXT, Voyage on SADL), Fiori list report, tile, deploy unit, `test/slice.mjs` 1-6 | e2e 1-4, 6 in the container; item 5 on a machine with the CDN (6 passed) | - |
| #7 (#4, #5) | README chapters 2-4 and 6; transaction `ZOSD_FLEET`; old `ZOSD_DEMO_REPORT` / `ZOSD_DEMO` removed; export inventory; e2e 7-10 | every step reachable over HTTP, e2e 7-10 with mutations | ch2 debugger step (VS Code UI); ch4 by hand |
| #8 | Cube `ZC_OSD_FLEETCUBE` (`@OData.publish`), AMDP `ZCL_OSD_FLEET_FUEL=>fuel_per_100km`, `DISTANCE_KM` / `DEP_MONTH`; e2e 11-12 | SQLite and DuckDB; AMDP numbers match the seed | HANA (expectations in `docs/hana.md`) |
| #9 | Tile opens `/app/flp.html#AirshipFleet-display` (engine #173) | `packs.json` applications, BSP files | item 5 with the new tile needs a CDN run |
| #10 | Classic ALV `ZOSD_FLEET_ALV` as `ZGUI_OSD_FLEET_ALV`; e2e 13 | e2e 13 with mutation; converter variants | - |

Critic subagents reviewed every PR before it opened; their verdicts are in
the PR bodies.

## Raised with the engine (open-steamgate), not fixed here

- A property with no column under a `table:` source (stg-compile).
- `@OData.publish` cubes do not group on `$select`.
- The report converter gets no DDIC types (GGCONV-E301).
- `MODIFY itab FROM wa` in a LOOP runs as Open SQL MODIFY after conversion.
- ALV on IDA (`CL_SALV_GUI_TABLE_IDA`) is not in the engine.

## Left open

- The rules on branch `af/rules` (`docs/airfleet-rules.md`).
- Follow-ups waiting on the engine: the STG -> OSD rename, the `osd.debug`
  step in chapter 2, cube grouping in chapter 5.
