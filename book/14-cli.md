# 14. My ABAP escaped from the server

Everything so far ran inside a system: a local one in VS Code, but a system,
with its server, its database and its sessions. This chapter takes one classic
report out of it. open-steamgate's **osabap** compiles an executable report,
through the ABAP-to-Go transpiler, into a single native program: no server, no
runtime to install, one file you can copy to another machine.

## What becomes of a report

```text
zosd_fleet_cli.prog.abap
  -> the report converter (a class with the report's lifecycle)
  -> gogen (typed IR, then Go for the report and its small runtime closure)
  -> go build
  -> fleet: one native executable (Linux, macOS, Windows; cross-compiled)
```

The selection screen stays the program's interface, in three shapes:

- **command line**: each `PARAMETERS` and `SELECT-OPTIONS` becomes an option,
  `--status M`, `--seed`, `--file ships.csv`; the list (`WRITE`) goes to
  stdout, messages to stderr, exit code 0, 1 (a `MESSAGE` of any type but
  `I` and `S`, or a runtime failure) or 2 (unsupported operation);
- **terminal form** (TUI): started without arguments in a terminal, it shows
  the selection screen as a form;
- **SAP GUI**: `-sapgui` serves the same selection screen to a real SAP GUI
  over DIAG on the local machine.

Two dashes are the report's (`--status`), one dash is the host's (`-db`,
`-allow-read`, `-help`), so a report's option can never collide with a flag
the host gains later.

The report of this chapter,
[ZOSD_FLEET_CLI](../cli/fleet/zosd_fleet_cli.prog.abap), lives in `cli/`, not
in the pack: it is a program of its own. Its tables are the fleet's
`ZOSD_FLEET_SHIP` and `ZOSD_FLEET_STAT`. osabap compiles only the tables
beside a report, so `cli/fleet` holds copies of their `src/ddic` definitions;
the check fails when the copies drift.

## Build it

In an open-steamgate checkout with Go 1.26 on the PATH and its libraries at
their pins (`npm run bootstrap`):

```sh
OSD_HOME=/path/to/open-steamgate node test/cli.mjs --keep /tmp/fleet-cli
```

It runs open-steamgate's `node tools/gogen/osabap.mjs` on the report, copies
the result to `/tmp/fleet-cli/run/fleet` and runs the steps below and a few
more as checks. With `GOOS`/`GOARCH` for another platform (for example
`GOOS=windows GOARCH=arm64`) it only builds and leaves `run/fleet.exe` there,
to copy to that machine. In VS Code, F8 on a report (`osd run`) builds and
runs it the same way.

## Run it

1. `./fleet -help`. Expected: the selection screen as options, then the
   host's flags.

   ![The selection screen becomes the command's options](img/cli-help.png)

2. `./fleet --status A`. Expected: refused with exit code 1, `keeps its rows
   in tables (ZOSD_FLEET_SHIP, ZOSD_FLEET_STAT): run it with -db FILE`. A
   report with tables never gets a silent in-memory database.
3. `./fleet -db fleet.sqlite --seed`. Expected: `Seeded 6 ships and 3
   statuses` and the six ships. The SQLite file is created with the report's
   tables; a second `--seed` says `Already 6 ships, nothing seeded`.
4. `./fleet -db fleet.sqlite --status M`. Expected: `S004 Cumulus` and
   `S006 Old Boiler`, `2 ships`.
5. `./fleet -db fleet.sqlite --file data/ships.csv`. Expected:
   `Error: cannot read data/ships.csv, Permission denied: no dataset root
   allows this (...)` on stderr and exit code 1. `OPEN DATASET` runs in a sandbox:
   without a grant every file is refused.
6. `./fleet -db fleet.sqlite -allow-read data -dataset-home data --file ships.csv`.
   Expected: `Loaded 2 ships from ships.csv`; `S004 Cumulus` is now `Docked`
   and a seventh ship, `S007 Zephyr`, is there.

   ![One session: refused without -db, seeded, filtered, refused and then allowed to read a file](img/cli-session.png)

The import is all or nothing. A line whose steam is not a number,
`S008,Gauge,A,plenty,Tinmere`, gives `Error: ship S008, steam plenty is not a
number; nothing loaded`, and none of the file's ships are kept. The report
rolls back and ends with `MESSAGE ... TYPE 'E'`. On a system that ends the
program with the message in the status bar, or cancels it in a background job; the native program writes the
lines it had before it to stdout, the message to stderr, and exits with 1, so
a script can tell.

## The same program, as a form

Start it without report options in a terminal: `./fleet -db fleet.sqlite`.
Tab and the arrow keys move between fields, Space toggles a checkbox, Enter
runs, Esc cancels. Type `M` in the status field and press Enter:

![The selection screen as a terminal form](img/tui-form.png)

![The list after Enter](img/tui-result.png)

Only `S006 Old Boiler` is in maintenance now: step 6 docked `S004 Cumulus`.

Without a terminal (a pipe, CI) the program asks for the fields line by line
instead, so the same binary works in scripts. The labels are the report's
selection texts, read from `zosd_fleet_cli.prog.xml` at build time, the same
ones `-help` shows.

## What it can and cannot do

The report is built and checked against open-steamgate's `main`, past 0.4: a
`MESSAGE` that ends the run needs #362, the selection texts as labels #363.
Since #364 and #369, a comma inside a template of a chained `WRITE:` and
`CATCH ... INTO` a global variable compile too.

- **Open SQL only on the report's own tables**, in the file `-db` names; each
  run is one LUW, `COMMIT WORK` and `ROLLBACK WORK` work. In 0.4 twelve of
  eighteen measured statement forms compiled: an aggregate into a scalar other
  than `COUNT(*)`, `UP TO ... ORDER BY`, `APPENDING TABLE`, a sorted target
  table, a `SELECT` loop with `GROUP BY` and inline `@DATA( )` did not, and
  one of them made the whole method unavailable. `main` compiles all eighteen;
  this report keeps to plain `SELECT ... INTO TABLE` into standard tables.
- **Files** through `OPEN`/`READ`/`TRANSFER DATASET` and `CL_GUI_FRONTEND_SERVICES`,
  inside the roots `-allow-read` / `-allow-write` grant.
- **Classes** beside the report or from `--lib` folders; open-abap-core
  classes it names come along.
- **One selection screen and one run** per process; no F4 value help, popups
  or interactive lists (`AT LINE-SELECTION`) yet; no HTTP, OData or ICF.
- **Like a system**: a pattern in `CP` uses `#` as its escape character, so a
  line starting with `#` is `CP '##*'`, not `CP '#*'`. **Unlike one**: a
  selection screen upper-cases `--status m`, the command line does not, so
  the report does it with `TRANSLATE`.

The specification is open-steamgate's
[docs/osabap-native.md](https://github.com/oisee/open-steamgate/blob/main/docs/osabap-native.md).

## Under the hood

The whole program logic is the report's `START-OF-SELECTION`:

<!-- code: cli/fleet/zosd_fleet_cli.prog.abap lines 28-61 -->
```abap
START-OF-SELECTION.
* a selection screen on a system upper-cases P_STATUS; the command line does not
  TRANSLATE p_status TO UPPER CASE.
  IF p_seed = abap_true.
    SELECT COUNT(*) FROM zosd_fleet_ship INTO gv_count.
    IF gv_count = 0.
      PERFORM seed.
      WRITE: / 'Seeded 6 ships and 3 statuses'.
    ELSE.
      WRITE: / 'Already', gv_count, 'ships, nothing seeded'.
    ENDIF.
  ENDIF.

  IF p_file IS NOT INITIAL.
    PERFORM load.
  ENDIF.

  IF p_status IS INITIAL.
    SELECT * FROM zosd_fleet_ship INTO TABLE gt_ships.
  ELSE.
    SELECT * FROM zosd_fleet_ship INTO TABLE gt_ships WHERE status = p_status.
  ENDIF.
  SELECT * FROM zosd_fleet_stat INTO TABLE gt_stats.
  SORT gt_ships BY ship_id.
  LOOP AT gt_ships INTO gs_ship.
    CLEAR gv_text.
    READ TABLE gt_stats INTO gs_stat WITH KEY status = gs_ship-status.
    IF sy-subrc = 0.
      gv_text = gs_stat-text.
    ENDIF.
    WRITE: / gs_ship-ship_id, gs_ship-name, gv_text, gs_ship-steam_pct, gs_ship-home_port.
  ENDLOOP.
  gv_count = lines( gt_ships ).
  WRITE: / gv_count, 'ships'.
```

And the CSV import: plain `DATASET` statements, one LUW, rolled back on the first bad line:

<!-- code: cli/fleet/zosd_fleet_cli.prog.abap lines 100-152 -->
```abap
FORM load.
  DATA lv_subrc TYPE i.
  OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING UTF-8 MESSAGE gv_msg.
  IF sy-subrc <> 0.
    gv_out = |Error: cannot read { p_file }, { gv_msg }|.
    MESSAGE gv_out TYPE 'E'.
  ENDIF.
  DO.
    CLEAR gv_line.
    READ DATASET p_file INTO gv_line.
    lv_subrc = sy-subrc.
* 4 is the end of the file; GV_LINE is cleared first, so a last line without a
* line feed is taken whether it comes with 0 or with 4
    IF lv_subrc > 4.
      EXIT.
    ENDIF.
    IF lv_subrc = 4 AND gv_line IS INITIAL.
      EXIT.
    ENDIF.
    IF gv_line IS NOT INITIAL AND gv_line NP '##*'.
      CLEAR gs_ship.
      gs_ship-mandt = sy-mandt.
      SPLIT gv_line AT ',' INTO gs_ship-ship_id gs_ship-name gs_ship-status gv_steam gs_ship-home_port.
      TRY.
          gs_ship-steam_pct = gv_steam.
        CATCH cx_sy_conversion_error.
          CLOSE DATASET p_file.
          ROLLBACK WORK.
          gv_out = |Error: ship { gs_ship-ship_id }, steam { gv_steam } is not a number; nothing loaded|.
          MESSAGE gv_out TYPE 'E'.
      ENDTRY.
      MODIFY zosd_fleet_ship FROM gs_ship.
      IF sy-subrc <> 0.
        CLOSE DATASET p_file.
        ROLLBACK WORK.
        gv_out = |Error: ship { gs_ship-ship_id } could not be written; nothing loaded|.
        MESSAGE gv_out TYPE 'E'.
      ENDIF.
      gv_loaded = gv_loaded + 1.
    ENDIF.
    IF lv_subrc <> 0.
      EXIT.
    ENDIF.
  ENDDO.
  CLOSE DATASET p_file.
  IF lv_subrc > 4.
    ROLLBACK WORK.
    gv_out = |Error: cannot read { p_file } to its end; nothing loaded|.
    MESSAGE gv_out TYPE 'E'.
  ENDIF.
  COMMIT WORK.
  WRITE: / 'Loaded', gv_loaded, 'ships from', p_file.
ENDFORM.
```
