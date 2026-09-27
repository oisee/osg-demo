ABAP running locally in VS Code, no SAP or ADT connection.

# open-steamgate demo

This folder is an abapGit repository and an open-steamgate workspace pack. The extension carries a whole local ABAP system; this repository adds its own objects on top of it.

## Install

1. Install the **open-steamgate** extension (`oisee.open-steamgate`, pre-release). Search for it in the Extensions view, or take the `.vsix` from the latest [`vscode-v*` release](https://github.com/oisee/open-steamgate/releases) and run **Extensions: Install from VSIX…**.
2. Clone this repository and open the clone as a VS Code folder.
3. Run **osd: Start (build + run this system)**. The bundled system starts. Because this folder has an `osd-pack.json`, it is layered on top as a full pack: its classes, tables, seed rows and page, in package `$ZOSD_DEMO`. The folder shows up under **Workspace layers** in Test Explorer.

To add this folder to a multi-folder workspace, add it before you start.

From an open-steamgate checkout, the same pack runs in a terminal: `OSD_PACKS=/path/to/osg-demo STG_PORT=8099 npm start`, with a free port. The editable ABAP is in `src/`; activating an object loads it into the running system.

## The story

The chapters run on one small domain this repository owns: a fleet of airships and their voyages. Chapter 1 needs nothing but a class. From chapter 2 on, the fleet's tables, service and app are used; [the fleet contract](docs/fleet-contract.md) fixes their names and shapes.

## 1. Hello

1. Open [ZOSD_DEMO_HELLO](src/zosd_demo_hello.clas.abap), place the cursor in the class and press **F9**. Expected: the **osd console** shows `Hello from ZOSD_DEMO_HELLO.`
2. Open Testing, expand **Workspace layers > osg-demo > ZOSD_DEMO_HELLO**, and run `known_line`; alternatively press **Ctrl+Shift+F10** in the class. Expected: one green ABAP Unit test.
3. Change the text returned by `greeting( )`, press **Ctrl+F2** to check, **Ctrl+F3** to save and activate, then **F9** again. Expected: the console shows your new text. Restore the original text, activate, and rerun the test to leave it green.

## 2. Debug, tests, and dumps

The rest of the guide uses the Airship fleet: six ships and their voyages, seeded into `ZOSD_FLEET_SHIP`, `ZOSD_FLEET_VOY` and `ZOSD_FLEET_STAT` every time the system starts (see [the contract](docs/fleet-contract.md)).

1. Open [ZCL_OSD_FLEET_REPORT](src/zcl_osd_fleet_report.clas.abap) and press **F9**. Expected: the console shows `Airship fleet` and one line per ship, starting with `S001 Albatross (Aloft): 6 voyages, 305 passengers` and ending with `S006 Old Boiler (Maintenance): 0 voyages, 0 passengers`.
2. Set `osd.debug` to `true` before **osd: Start**. In `ship_lines`, set a breakpoint on `steam_check( ls_ship-steam_pct ).` with **Ctrl+Shift+B** and run **osd: Run as ABAP Application with debugger**. Expected: VS Code stops on that line with the first ship, `S001`, in `ls_ship`. Continue with **F8**; the console prints the same six lines as in step 1.
3. Break a test on purpose. In [the test class](src/zcl_osd_fleet_report.clas.testclasses.abap), remove the leading `*` from the `broken_on_purpose` declaration (line 11) and from its method (lines 40-44), press **Ctrl+F3**, and run the tests of `ZCL_OSD_FLEET_REPORT` in Testing. Expected: `counts_voyages` is green and `broken_on_purpose` is red with a failed assertion: it expects `1 voyages` for S006, and the report says `0 voyages`. Put the six `*` back, activate, and rerun: only `counts_voyages` is left, green.
4. Make the report dump. A ship cannot have less than no steam, and `steam_check` says so with `ASSERT iv_steam_pct >= 0`. Give a ship negative steam through OData (chapter 3 explains the calls):

   ```
   B=http://localhost:8099/sap/opu/odata/sap/ZOSD_FLEET_SRV
   T=$(curl -s -c jar -D - -o /dev/null -H "x-csrf-token: fetch" "$B/" | grep -i '^x-csrf-token' | tr -d '\r' | cut -d' ' -f2)
   curl -s -b jar -X MERGE -H "x-csrf-token: $T" -H "Content-Type: application/json" -d '{"SteamPct":-5}' "$B/ShipSet('S004')"
   ```

   Run the report again with **F9**. Expected: the console shows `Airship fleet` and then `Runtime error: ASSERTION_FAILED` with `zcl_osd_fleet_report.clas.abap` and the line `ASSERT iv_steam_pct >= 0.`; no ship line is printed: the report collects all lines before it writes any, and S004's check stops it first. Set `SteamPct` back to `15` with the same MERGE, or restart the system: the seed replaces the rows at every start.
5. Run the transaction. Open the launchpad's **WEBGUI** tile and enter `ZOSD_FLEET` (or open `http://localhost:8099/sap/bc/gui/sap/its/webgui/?okcode=ZOSD_FLEET` directly). Expected: the screen is titled `ZOSD_FLEET - Airship fleet` and lists the same six lines. The transaction is [ZCL_OSD_FLEET_TRAN](src/zcl_osd_fleet_tran.clas.abap): it implements the engine's `ZIF_OSD_TRANSACTION` and calls `ship_lines( )`; it does not `SUBMIT` a report.

## 3. OData ladder

`ZOSD_FLEET_SRV` is defined in one file, [zosd_fleet.stg.yaml](src/zosd_fleet.stg.yaml); the engine compiles it into the SEGW project, the model and the data provider at start. [ZCL_ZOSD_FLEET_DPC_EXT](src/zcl_zosd_fleet_dpc_ext.clas.abap) is the hand-written part. The URLs below assume port 8099; any browser shows the `GET`s.

1. `$metadata`: open `http://localhost:8099/sap/opu/odata/sap/ZOSD_FLEET_SRV/$metadata`. Expected: three entity sets, `ShipSet`, `VoyageSet` and `StatusVHSet`; `Ship` has the navigation property `Voyages`, and the annotations give `Ship/Status` a value list.
2. Query: `.../ShipSet?$format=json`. Expected: six ships, each with `StatusText` (`Aloft`, `Docked` or `Maintenance`) next to its `Status`. `ShipSet/$count` answers `6`. `StatusText` is not a column of `ZOSD_FLEET_SHIP`; `shipset_get_entityset` fills it from `ZOSD_FLEET_STAT`.
3. Filter: `.../ShipSet?$filter=Status eq 'A'&$format=json`. Expected: S001 Albatross and S003 Brass Heron, the two aloft ships. Try `$orderby=SteamPct desc` and `$top=2&$inlinecount=allpages`: the page has two rows and `__count` stays `6`.
4. Change a ship with MERGE, using the commands of chapter 2 step 4 with `-d '{"SteamPct":55}'` on `ShipSet('S002')`. Expected: HTTP 204; `.../ShipSet('S002')?$format=json` then reads `"SteamPct":55`, and `Name` is still `Nimbus`, because MERGE changes only the fields it sends. `shipset_update_entity` writes the row.
5. Value help: `.../StatusVHSet?$format=json`. Expected: three rows, `A` Aloft, `D` Docked, `M` Maintenance, served by the elementary search help `ZOSD_FLEET_STATUS_SH`. `.../StatusVHSet('A')` answers the single row.
6. Navigation: `.../ShipSet('S001')/Voyages?$format=json`. Expected: S001's six voyages, from `V00001` in January to later in the year. `.../ShipSet('S006')/Voyages` is empty: Old Boiler never left port. `voyageset_get_entityset` serves this navigation, because a `table:` source has no association binding yet.

## 4. Fiori apps

The pack's [webapp/](webapp/) is a Fiori Elements list report and object page over `ZOSD_FLEET_SRV`. It has no controller code: the columns, filters and facets come from the annotations in the YAML. SAPUI5 loads from ui5.sap.com, so the browser needs to reach it.

1. Open the launchpad (`http://localhost:8099/app/flp.html`) and click the **Airship fleet** tile. Expected: the address ends in `#AirshipFleet-display`, and the list report opens inside the launchpad and shows the six ships with Ship, Name, Status (text first, e.g. `Aloft (A)`), Steam (%) and Home port.
2. In the filter bar, open the value help of **Status**, pick `Maintenance`, and press **Go**. Expected: Cumulus and Old Boiler. The value help lists the three statuses from `StatusVHSet`.
3. Click **Old Boiler**. Expected: the object page shows its general data and an empty **Voyages** table. Go back and open **Albatross**: its **Voyages** table lists six voyages.
4. The tile goes through the launchpad the way a system's does: `#AirshipFleet-display` is the intent the app's [manifest](webapp/manifest.json) declares in `crossNavigation.inbounds`, and the launchpad opens the component `osd.fleet` from the app's BSP copy, `/sap/bc/ui5_ui5/sap/zosg_demo/`. The same app also runs standalone at `http://localhost:8099/app/osg-demo/`; see [the contract](docs/fleet-contract.md#app).

## 5. AMDP

Coming. See [Running on HANA](docs/hana.md) and the planned exercise in [Next chapters](docs/next-chapters.md).

## 6. Take it to a system

What can leave this repository for a real system is listed, object by object, in [deploy/manifest.json](deploy/manifest.json); [Take it to a system](docs/take-to-system.md) builds the abapGit zip and says what travels and what does not.

1. Build the zip as that page shows: stage a copy of this folder without `ZCL_OSD_FLEET_TRAN` and `TRAN ZOSD_FLEET`, then `npm run segw:zip` on the copy. Expected: it lists the hello class, the three fleet tables, the search help, the report class, the SEGW project, service and model with their classes, and the app as `WAPA zosg_demo` with its `SICF` node; and it says the seed rows are not carried.
2. Leave the two local objects in and run it again. Expected: `not-in-manifest` for `CLAS ZCL_OSD_FLEET_TRAN` and `TRAN ZOSD_FLEET`, and no new zip (the one from step 1 stays as it was; remove it first or use another `--out`). The transaction's class implements `ZIF_OSD_TRANSACTION`, which exists only in open-steamgate.
3. Importing the zip into a sandbox is a human step on a system you are allowed to change. Expected: nothing to run here; the page's import steps list what to activate and check on the system.

## Run the checks

In an open-steamgate checkout, run `npm install && npm run bootstrap` once. Then `OSD_HOME=/path/to/open-steamgate node test/slice.mjs` builds that engine checkout with this folder as a pack, starts it on a free port and checks the Airship fleet end to end: six ships in `ShipSet`, the fleet report's classrun, a `$filter` on status, a MERGE that reads back, the launchpad tile opening the list report (this one needs a browser that reaches ui5.sap.com; `SLICE_SKIP_UI=1` skips it and says so, `SLICE_CHROMIUM=<path>` picks the browser), and the report's ABAP Unit test. Use the engine's main branch at `0ba17ed` or later: the tile opens the app through the launchpad intent, which older engines do not resolve for a pack. It stops the engine it started, and exits non-zero if any check fails.
