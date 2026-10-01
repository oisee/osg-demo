# 2. Debug, tests, and dumps

The rest of the guide uses the Airship fleet: six ships and their voyages, seeded into `ZOSD_FLEET_SHIP`, `ZOSD_FLEET_VOY` and `ZOSD_FLEET_STAT` every time the system starts (see [the contract](../docs/fleet-contract.md)).

To inspect the data, open a definition below and press **F8**. The extension opens Data Preview; it reads the rows seeded from `data/` when the system starts. Leave an active debug session first, since F8 controls execution while debugging ABAP.

| Definition | Expected rows |
| --- | ---: |
| [ZOSD_FLEET_SHIP](../src/ddic/zosd_fleet_ship.tabl.xml) | 6 ships |
| [ZOSD_FLEET_VOY](../src/ddic/zosd_fleet_voy.tabl.xml) | 20 voyages |
| [ZOSD_FLEET_STAT](../src/ddic/zosd_fleet_stat.tabl.xml) | 3 statuses |
| [ZC_OSD_FLEETCUBE](../src/cds/zc_osd_fleetcube.ddls.asddls) | 20 voyage rows (chapter 5) |

![F8 on ZOSD_FLEET_SHIP: Data Preview with the six ships](img/vscode-data-preview.png)

1. Open [ZCL_OSD_FLEET_REPORT](../src/zcl_osd_fleet_report.clas.abap) and press **F9**. Expected: the console shows `Airship fleet` and one line per ship, starting with `S001 Albatross (Aloft): 6 voyages, 305 passengers` and ending with `S006 Old Boiler (Maintenance): 0 voyages, 0 passengers`.
2. In `ship_lines`, set a breakpoint on `steam_check( ls_ship-steam_pct ).` with **Ctrl+Shift+B** and run **osd: Run as ABAP Application with debugger**. The debugger attaches automatically. Expected: VS Code stops on that line with the first ship, `S001`, in `ls_ship`. Continue with **F8**: it stops again at the next ship while the breakpoint is there, so remove it (**Ctrl+Shift+B** again) and press **F8** once more; the console prints the same six lines as in step 1. Afterwards stop the debug session (**Run > Stop Debugging**). From 0.4 on, F9 and F8 go back to running as soon as the debugger no longer stands on a line; on 0.3.1370 they keep toggling and continuing while the session runs, and with a breakpoint left the next start attaches it again. If **Ctrl+Shift+B** sets no breakpoint (the extension 0.4.1414 opens `.abap` as Plain Text, where VS Code refuses one), set `"debug.allowBreakpointsEverywhere": true` in your settings.

   ![Stopped on steam_check: the variables of ship_lines and the call stack](img/vscode-debugger.png)

3. Break a test on purpose. In [the test class](../src/zcl_osd_fleet_report.clas.testclasses.abap), remove the leading `*` from the `broken_on_purpose` declaration (line 11) and from its method (lines 40-44), press **Ctrl+F3**, and run the tests of `ZCL_OSD_FLEET_REPORT` in Testing. Expected: `counts_voyages` is green and `broken_on_purpose` is red with a failed assertion: it expects `1 voyages` for S006, and the report says `0 voyages`. Put the six `*` back, activate, and rerun: only `counts_voyages` is left, green.
4. Make the report dump. A ship cannot have less than no steam, and `steam_check` says so with `ASSERT iv_steam_pct >= 0`. Give a ship negative steam through OData (chapter 3 explains the calls):

   ```
   B=http://localhost:8099/sap/opu/odata/sap/ZOSD_FLEET_SRV
   T=$(curl -s -c jar -D - -o /dev/null -H "x-csrf-token: fetch" "$B/" | grep -i '^x-csrf-token' | tr -d '\r' | cut -d' ' -f2)
   curl -s -b jar -X MERGE -H "x-csrf-token: $T" -H "Content-Type: application/json" -d '{"SteamPct":-5}' "$B/ShipSet('S004')"
   ```

   Run the report again with **F9**. Expected: the console shows `Airship fleet` and then `Runtime error: ASSERTION_FAILED` with `zcl_osd_fleet_report.clas.abap` and the line `ASSERT iv_steam_pct >= 0.`; no ship line is printed: the report collects all lines before it writes any, and S004's check stops it first. Set `SteamPct` back to `15` with the same MERGE, or restart the system: the seed replaces the rows at every start.
5. Run the transaction. Open the launchpad's **WEBGUI** tile and enter `ZOSD_FLEET` (or open `http://localhost:8099/sap/bc/gui/sap/its/webgui/?okcode=ZOSD_FLEET` directly). Expected: the screen is titled `ZOSD_FLEET - Airship fleet` and lists the same six lines. The transaction is [ZCL_OSD_FLEET_TRAN](../src/zcl_osd_fleet_tran.clas.abap): it implements the engine's `ZIF_OSD_TRANSACTION` and calls `ship_lines( )`; it does not `SUBMIT` a report.

   ![Transaction ZOSD_FLEET in WEBGUI: one line per ship](img/webgui-fleet-report.png)

6. The fleet in a classic ALV. [ZOSD_FLEET_ALV](../src/zosd_fleet_alv.prog.abap) is a report that reads the ships, adds each status text and shows them with `CL_SALV_TABLE=>FACTORY` and `display( )`. The engine converts a classic report into a class and runs it as a transaction named `ZGUI_` plus the program name without its `Z`: enter `ZGUI_OSD_FLEET_ALV` in **WEBGUI** (or open `http://localhost:8099/sap/bc/gui/sap/its/webgui/?okcode=ZGUI_OSD_FLEET_ALV`). Expected: a grid with the columns `SHIP_ID`, `NAME`, `STATUS`, `TEXT`, `STEAM_PCT`, `HOME_PORT` and one row per ship, from `S001 Albatross A Aloft 82 Port Aurel` to `S006 Old Boiler M Maintenance 0 Tinmere`. The headers are the field names because the row type uses built-in types; the report's comment says why.

   ![ZGUI_OSD_FLEET_ALV: CL_SALV_TABLE as a grid](img/webgui-fleet-alv.png)

## Under the hood

The assertion that makes step 4 dump:

<!-- code: src/zcl_osd_fleet_report.clas.abap method steam_check -->
```abap
METHOD steam_check.
  ASSERT iv_steam_pct >= 0.
ENDMETHOD.
```

The report's lines, with the call the breakpoint of step 2 sits on:

<!-- code: src/zcl_osd_fleet_report.clas.abap method ship_lines -->
```abap
METHOD ship_lines.
  DATA lt_ship   TYPE STANDARD TABLE OF zosd_fleet_ship.
  DATA ls_ship   LIKE LINE OF lt_ship.
  DATA lt_voy    TYPE STANDARD TABLE OF zosd_fleet_voy.
  DATA ls_voy    LIKE LINE OF lt_voy.
  DATA lt_status TYPE STANDARD TABLE OF zosd_fleet_stat.
  DATA ls_status LIKE LINE OF lt_status.
  DATA lv_count  TYPE i.
  DATA lv_pax    TYPE i.
  DATA lv_line   TYPE string.

  SELECT * FROM zosd_fleet_ship INTO TABLE lt_ship ORDER BY ship_id.
  SELECT * FROM zosd_fleet_voy INTO TABLE lt_voy.
  SELECT * FROM zosd_fleet_stat INTO TABLE lt_status.

  LOOP AT lt_ship INTO ls_ship.
    steam_check( ls_ship-steam_pct ).
    CLEAR: lv_count, lv_pax, ls_status.
    LOOP AT lt_voy INTO ls_voy WHERE ship_id = ls_ship-ship_id.
      lv_count = lv_count + 1.
      lv_pax = lv_pax + ls_voy-passengers.
    ENDLOOP.
    READ TABLE lt_status INTO ls_status WITH KEY status = ls_ship-status.
    lv_line = |{ ls_ship-ship_id } { ls_ship-name } ({ ls_status-text }): |
           && |{ lv_count } voyages, { lv_pax } passengers|.
    APPEND lv_line TO rt_lines.
  ENDLOOP.
ENDMETHOD.
```

The classic ALV of step 6 is plain SALV:

<!-- code: src/zosd_fleet_alv.prog.abap lines 51-61 -->
```abap
TRY.
    cl_salv_table=>factory(
      IMPORTING
        r_salv_table = go_alv
      CHANGING
        t_table      = gt_rows ).
  CATCH cx_salv_msg INTO gx_salv.
    WRITE: / gx_salv->get_text( ).
    RETURN.
ENDTRY.
go_alv->display( ).
```
