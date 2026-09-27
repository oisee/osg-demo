# Airship fleet: the demo contract

osg-demo teaches open-steamgate on one small domain the repository owns:
a fleet of airships and their voyages. This file is the contract the
chapters are built against. Names, keys and shapes here are fixed; a
chapter PR that needs to change one changes this file in the same PR.

Everything lives in package `$ZOSD_DEMO` (see `osd-pack.json`). New objects
use the `ZOSD_` / `ZCL_OSD_` prefix.

## Main path (first release)

1. Seeded ships are in the tables when the system starts.
2. Run the fleet report as a classrun; set a breakpoint, step through it.
3. a. Break a unit test on purpose; ABAP Unit reports a failed assertion.
   b. Run the report with a negative steam value; the `ASSERT` in
      `steam_check` dumps. This is a separate exercise from 3a.
4. Change a ship through OData (`ShipSet`, MERGE).
5. See the change in the Fiori list report, with the status value help.

Out of the main path:
- the APC "fleet radar";
- the cube plus AMDP chapter, which is optional and advanced, with the
  portable (SQLite/DuckDB) outcome and the HANA outcome stated separately;
- the export chapter, which is an honest inventory of what `segw:zip`
  carries, not a feature build.

## Tables

All three tables are client-dependent (`MANDT` first), transparent and owned
by this pack. Their rows come from `data/*.tabu.json` and are replaced at
start.

`ZOSD_FLEET_SHIP`: one row per airship.

| Field     | Type      | Key | Note                           |
|-----------|-----------|-----|--------------------------------|
| MANDT     | CLNT 3    | x   |                                |
| SHIP_ID   | CHAR 4    | x   | `S001` …                        |
| NAME      | CHAR 30   |     |                                |
| STATUS    | CHAR 1    |     | a key of `ZOSD_FLEET_STAT`     |
| STEAM_PCT | INT4      |     | 0..100; below 0 is the dump    |
| HOME_PORT | CHAR 20   |     |                                |

`ZOSD_FLEET_VOY`: one row per voyage.

| Field      | Type    | Key | Note                    |
|------------|---------|-----|-------------------------|
| MANDT      | CLNT 3  | x   |                         |
| VOYAGE_ID  | CHAR 6  | x   | `V00001` …               |
| SHIP_ID    | CHAR 4  |     | a `ZOSD_FLEET_SHIP` key |
| FROM_PORT  | CHAR 20 |     |                         |
| TO_PORT    | CHAR 20 |     |                         |
| DEP_DATE   | DATS    |     |                         |
| ARR_DATE   | DATS    |     |                         |
| PASSENGERS | INT4    |     |                         |
| FUEL_KG    | INT4    |     |                         |

`ZOSD_FLEET_STAT`: the status values and their texts.

| Field  | Type    | Key |
|--------|---------|-----|
| MANDT  | CLNT 3  | x   |
| STATUS | CHAR 1  | x   |
| TEXT   | CHAR 20 |     |

Rows: `D` Docked, `A` Aloft, `M` Maintenance.

## Seed

- 6 ships, S001..S006:
  - Albatross, Nimbus, Brass Heron, Cumulus, Lady Kelvin, Old Boiler;
  - at least one ship in each status;
  - home ports spread over three ports.
- 20 voyages over those ships, within one calendar year so the dates sort
  visibly, and at least one ship with no voyages.
- Values are fictional. No real people, companies or places that read as
  claims.

## Search help

`ZOSD_FLEET_STATUS_SH`: an elementary search help over `ZOSD_FLEET_STAT`.
It returns `STATUS` and lists `TEXT`. It must be elementary, because a
collective search help is not served.

## ABAP

- `ZCL_OSD_FLEET_REPORT`:
  - implements `if_oo_adt_classrun`;
  - `main` prints the fleet, one line per ship with its voyage count and
    passengers;
  - `steam_check` asserts `steam_pct >= 0`, which is the dump exercise;
  - a public method `ship_lines( )` returns the lines as a table, so a unit
    test can read them.
- Test class for it, `ltcl_fleet`:
  - `counts_voyages`: the report's line for a known ship;
  - `broken_on_purpose`: commented out, the reader uncomments it.
- `ZCL_OSD_FLEET_TRAN`:
  - implements `ZIF_OSD_TRANSACTION` and shows the report's lines;
  - transaction `ZOSD_FLEET` names it;
  - it does not use `SUBMIT` (not implemented).
- The existing `ZOSD_DEMO_HELLO` / `ZOSD_DEMO_REPORT` / `ZOSD_DEMO` stay as
  chapter 1.

## OData service

Defined in `src/zosd_fleet.stg.yaml` and compiled by `stg-compile --all`.

- Project `ZOSD_FLEET`, service `ZOSD_FLEET_SRV`, model `ZOSD_FLEET_MDL`.
- A hand-written `ZCL_ZOSD_FLEET_DPC_EXT` in `src/` wins over the generated
  skeleton where the chapter needs code.

| Entity   | Set         | Keys      | Source             | Operations         |
|----------|-------------|-----------|--------------------|--------------------|
| Ship     | ShipSet     | ShipId    | the DPC_EXT over `ZOSD_FLEET_SHIP` | C R U D Q |
| Voyage   | VoyageSet   | VoyageId  | `table: ZOSD_FLEET_VOY` (SADL) | R Q    |
| StatusVH | StatusVHSet | Status    | the search help    | R Q                |

- Ship has no `table:` source. A table source types the entity as the table
  (`TS_SHIP type ZOSD_FLEET_SHIP`), and the table has no column for
  `StatusText`, so the DPC_EXT could not fill it. Ship's properties declare
  its structure instead, and `ZCL_ZOSD_FLEET_DPC_EXT` serves all five
  operations with Open SQL over `ZOSD_FLEET_SHIP` (filter, search,
  `$orderby`, paging), the way the engine's own `ZCL_ZSTG_DEMO_DPC_EXT`
  serves Travel.
- Property names are the fields in CamelCase: `ShipId`, `Name`, `Status`,
  `SteamPct`, `HomePort`, `VoyageId`, `FromPort`, `ToPort`, `DepDate`,
  `ArrDate`, `Passengers`, `FuelKg`, `Text`.
- Every property whose DDIC field has an underscore names it with `field:`
  (for example `ShipId: {type: String(4), field: SHIP_ID}`). Without that,
  stg-compile uppercases the property name and gets `SHIPID`. This is the
  same shape as `zstg_demo.stg.yaml` in the engine.
- YAML types: CHAR n is `String(n)`, INT4 is `Int32`, DATS is `Date`.
- `Ship.StatusText` (String(20), read-only, not sortable or filterable):
  `ZCL_ZOSD_FLEET_DPC_EXT` fills it from `ZOSD_FLEET_STAT`.
  - `Ship/Status` carries `text: {path: StatusText, arrangement: TextFirst}`.
  - It also carries a `Common.ValueList` to `StatusVHSet`, with
    `inOut: {Status: Status}` and `displayOnly: Text`.
  - The search-help mapping maps both `query` and `read`, so
    `StatusVHSet('A')` answers.
- Navigation `Ship/Voyages` (1:n on `ShipId`): the association is declared
  in the model, but Voyage's `table:` source has no association binding. So
  `ZCL_ZOSD_FLEET_DPC_EXT` filters `ZOSD_FLEET_VOY` by `SHIP_ID` for that
  navigation. The first slice does not use it; the object-page facet does.
  A binding for table sources in the engine can come after the slice.
- Annotations are in the YAML: a header, `selectionFields` [Status,
  HomePort], a `lineItem` [ShipId, Name, Status, SteamPct, HomePort], and
  an object page facet with the voyages table.
- Later in chapter 3, not in the first slice: function imports `Launch`
  and `Dock` (ShipId in, Ship out) that set the status.

## App

The pack's `webapp/` is a Fiori Elements V2 list report + object page over
`ZOSD_FLEET_SRV`. The engine derives its BSP application name, `ZOSG_DEMO`
(`packAppName`).
- `webapp/manifest.json` declares the inbound `AirshipFleet-display` in
  `crossNavigation.inbounds`.
- `osd-pack.json` gets one entry under `tiles`: "Airship fleet", whose URL is
  `/app/osg-demo/`, the pack's own page (the engine's default tile URL). The
  tile takes a URL, not an intent field. It does not point at
  `/app/flp.html#AirshipFleet-display`: the launchpad resolves only the
  intents `webapp/flp.html` names before boot, and a pack's inbounds are
  not registered there yet. Once the engine registers them, the tile can
  move to the intent.
- From `/app/osg-demo/` the data source `../../sap/opu/odata/sap/ZOSD_FLEET_SRV/`
  resolves as written. The BSP copy of the app, `/sap/bc/ui5_ui5/sap/zosg_demo/`,
  loads data once the engine's pack-app manifest rebase has landed (packApps
  rewrites the OData URI in `manifest.json`).

## First joint slice

One running workspace pack. Each item has one e2e assertion on what the
reader sees:
- tables + seed: `ShipSet` returns 6;
- the classrun prints a line for `S001`:
  `POST /sap/bc/adt/oo/classrun/ZCL_OSD_FLEET_REPORT`, then look for that
  line in the plain-text answer;
- the service answers `ShipSet?$filter=Status eq 'A'`;
- the tile opens the list report, and the list shows 6 rows.

The e2e runs the pack through `OSD_PACKS`. A reader opens the folder in
VS Code, and the folder is layered as a workspace pack (engine W1, #158).
Seed rows use `MANDT` `123`; dates may be ISO strings in the TABU JSON.

After the slice, chapters 2–5 are split into PRs, one e2e assertion each.
