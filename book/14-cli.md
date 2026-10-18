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

## A file chosen with F4

The fleet report reads its CSV with `OPEN DATASET`: a file the program names
by path, as a file on the application server would be. A report that asks the
user for a file works differently on a system: F4 on the parameter opens the
frontend's file dialog, and the program reads the chosen file from the
frontend with `GUI_UPLOAD`. The second report of this chapter,
[ZOSD_FLEET_CSV](../cli/csv/zosd_fleet_csv.prog.abap), does exactly that and
shows the file as a simple list, the column headings taken from its first
line:

<!-- code: cli/csv/zosd_fleet_csv.prog.abap lines 22-41 -->
```abap
AT SELECTION-SCREEN ON VALUE-REQUEST FOR p_file.
  DATA lt_files  TYPE filetable.
  DATA lv_rc     TYPE i.
  DATA lv_action TYPE i.
  cl_gui_frontend_services=>file_open_dialog(
    EXPORTING window_title = 'Choose a CSV file'
              file_filter  = 'CSV (*.csv)|*.csv|All (*.*)|*.*'
    CHANGING  file_table   = lt_files
              rc           = lv_rc
              user_action  = lv_action ).
  IF lv_action = cl_gui_frontend_services=>action_ok AND lv_rc > 0.
    READ TABLE lt_files INDEX 1 INTO DATA(ls_file).
    p_file = ls_file-filename.
  ENDIF.

START-OF-SELECTION.
  cl_gui_frontend_services=>gui_upload(
    EXPORTING filename = p_file
              filetype = 'ASC'
    CHANGING  data_tab = gt_lines ).
```

`test/cli.mjs` builds it beside the fleet program, into `run/fleet-csv`, and
keeps two CSV files in `/tmp/fleet-cli/data`.

1. `./fleet-csv -allow-read /tmp/fleet-cli/data`. Expected: the form, with
   one field.

   ![The CSV report's selection screen](img/csv-form.png)

2. F4 on the field. Expected: a file browser in the terminal, at the folder
   the grant allows and nothing outside it. Arrows move, Enter opens a folder
   or chooses a file, `/` filters, Esc cancels.

   ![F4: the terminal file browser at the granted folder](img/csv-f4.png)

3. Enter on `fleet.csv`, then Enter to run. Expected: the chosen path back in
   the field, then the list: the headings from the file's first line, the six
   ships, `6 rows, 5 columns`.

   ![The CSV as a list](img/csv-list.png)

4. Without a screen, from that folder:
   `../run/fleet-csv --p-file fleet.csv -allow-read /tmp/fleet-cli/data`
   prints the same list. Without `-allow-read` it prints `osabap: permission
   denied` on stderr and exits with 1: the file dialog and `GUI_UPLOAD` use the
   same sandbox as `DATASET`, so a file outside the grant can be neither listed
   nor read.

At this book's tag the list has an empty line after each of the first two
rules and the count is indented by four spaces. open-steamgate removed both
after the tag, in
[PR #809](https://github.com/oisee/open-steamgate/pull/809).

## A relative: screens in CICS

The selection screen and the dynpro are SAP's, but the way they work has a
close relative in IBM's CICS, the transaction monitor of the 3270 terminal
era. IBM's guide to CICS describes pseudo-conversational processing: a CICS
program sends a screen and ends its task (BMS is the CICS interface that
builds such screens from predefined maps); the user's input starts a new task,
which picks up the state passed on to it. A chain of short tasks looks to the
user like one conversation, and between screens the program is not running at
all. SAP's dialog steps work alike: a dialog step is the PAI of the screen the
user answered followed by the PBO of the next screen, and while a screen waits
for input no work process is held. This program is the simplest case, one
screen and one answer per run.

The guide also describes giving existing 3270 programs a new presentation
without changing them, for example a web front end that plays the terminal
for the unchanged program. SAP's WEBGUI is a similar idea, the same screens
rendered as HTML in a browser (chapter 2); the terminal form and `-sapgui`
here are two more ways to show one selection screen.

Source: IBM Redbooks, *Architect's Guide to IBM CICS on System z*:
pseudo-conversational design in chapter 1 (p. 11); the presentation layer,
3270, BMS and state in 3.3 (p. 58–60); modernizing the 3270 presentation
layer in 4.6 (p. 104–106).

## What it can and cannot do

- **Open SQL only on the report's own tables**, in the file `-db` names; each
  run is one LUW, `COMMIT WORK` and `ROLLBACK WORK` work. This report keeps
  to plain `SELECT ... INTO TABLE` into standard tables and one
  `SELECT COUNT(*)` into a variable.
- **Files** through `OPEN`/`READ`/`TRANSFER DATASET` and `CL_GUI_FRONTEND_SERVICES`,
  inside the roots `-allow-read` / `-allow-write` grant.
- **Classes** beside the report or from `--lib` folders; open-abap-core
  classes it names come along.
- **One selection screen and one run** per process. F4 runs
  `AT SELECTION-SCREEN ON VALUE-REQUEST` in the terminal form, and the
  frontend file dialogs open a file browser there (not in `-sapgui` mode);
  no F1, popups or interactive lists (`AT LINE-SELECTION`) yet; no HTTP,
  OData or ICF.
- **Like a system**: a pattern in `CP` uses `#` as its escape character, so a
  line starting with `#` is `CP '##*'`, not `CP '#*'`. **Unlike one**: a
  selection screen upper-cases `--status m`, the command line does not, so
  the report does it with `TRANSLATE`.

The specification is open-steamgate's
[docs/osabap-native.md](https://github.com/oisee/open-steamgate/blob/vscode-stable-v0.7.1696/docs/osabap-native.md), and F4 has its own,
[docs/osabap-f4.md](https://github.com/oisee/open-steamgate/blob/vscode-stable-v0.7.1696/docs/osabap-f4.md).

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
