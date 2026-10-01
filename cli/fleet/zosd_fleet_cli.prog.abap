REPORT zosd_fleet_cli.
* The Airship fleet as a command line program (book chapter 14). open-steamgate's
* osabap compiles this report through the ABAP-to-Go transpiler into one
* native binary; the selection screen becomes its options:
*   fleet -db fleet.sqlite --seed          the six ships and their statuses
*   fleet -db fleet.sqlite --status M      only the ships in maintenance
*   fleet -db fleet.sqlite -allow-read data -dataset-home data --file ships.csv
*                                          add or change ships from a CSV
* Its tables are the fleet's own ZOSD_FLEET_SHIP and ZOSD_FLEET_STAT; their
* .tabl.xml beside it are copies of src/ddic that test/cli.mjs keeps in step.
* Written for what the
* Go backend compiles: SELECT ... INTO TABLE into standard tables, no inline
* declarations, no colon or semicolon inside literals of chained WRITEs, no
* string templates in a WRITE (the messages go through GV_OUT).

PARAMETERS p_status TYPE c LENGTH 1.
PARAMETERS p_seed AS CHECKBOX.
PARAMETERS p_file TYPE c LENGTH 200 LOWER CASE.

DATA gt_ships TYPE STANDARD TABLE OF zosd_fleet_ship WITH DEFAULT KEY.
DATA gs_ship TYPE zosd_fleet_ship.
DATA gt_stats TYPE STANDARD TABLE OF zosd_fleet_stat WITH DEFAULT KEY.
DATA gs_stat TYPE zosd_fleet_stat.
DATA gv_count TYPE i.
DATA gv_line TYPE string.
DATA gv_msg TYPE string.
DATA gv_out TYPE string.
DATA gv_steam TYPE string.
DATA gv_loaded TYPE i.
DATA gv_text TYPE c LENGTH 20.

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

FORM seed.
  PERFORM add_ship USING 'S001' 'Albatross' 'A' 82 'Port Aurel'.
  PERFORM add_ship USING 'S002' 'Nimbus' 'D' 100 'Port Aurel'.
  PERFORM add_ship USING 'S003' 'Brass Heron' 'A' 64 'Cloudhaven'.
  PERFORM add_ship USING 'S004' 'Cumulus' 'M' 15 'Cloudhaven'.
  PERFORM add_ship USING 'S005' 'Lady Kelvin' 'D' 90 'Tinmere'.
  PERFORM add_ship USING 'S006' 'Old Boiler' 'M' 0 'Tinmere'.
  PERFORM add_stat USING 'A' 'Aloft'.
  PERFORM add_stat USING 'D' 'Docked'.
  PERFORM add_stat USING 'M' 'Maintenance'.
  COMMIT WORK.
ENDFORM.

FORM add_ship USING iv_id TYPE csequence iv_name TYPE csequence iv_status TYPE csequence
                    iv_steam TYPE i iv_port TYPE csequence.
  CLEAR gs_ship.
  gs_ship-mandt = sy-mandt.
  gs_ship-ship_id = iv_id.
  gs_ship-name = iv_name.
  gs_ship-status = iv_status.
  gs_ship-steam_pct = iv_steam.
  gs_ship-home_port = iv_port.
  INSERT zosd_fleet_ship FROM gs_ship.
ENDFORM.

FORM add_stat USING iv_status TYPE csequence iv_text TYPE csequence.
  CLEAR gs_stat.
  gs_stat-mandt = sy-mandt.
  gs_stat-status = iv_status.
  gs_stat-text = iv_text.
  INSERT zosd_fleet_stat FROM gs_stat.
ENDFORM.

* One ship per line, SHIP_ID,NAME,STATUS,STEAM_PCT,HOME_PORT; a line that
* starts with # is a comment. An existing ship is changed. A file that cannot
* be read, or a ship that cannot be written, is reported and nothing of the
* file is kept. (On a system this would be MESSAGE ... TYPE 'E'; osabap does
* not compile that yet, so the program writes the error and returns.)
FORM load.
  DATA lv_subrc TYPE i.
  OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING UTF-8 MESSAGE gv_msg.
  IF sy-subrc <> 0.
    gv_out = |Error: cannot read { p_file }, { gv_msg }|.
    WRITE / gv_out.
    RETURN.
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
          WRITE / gv_out.
          RETURN.
      ENDTRY.
      MODIFY zosd_fleet_ship FROM gs_ship.
      IF sy-subrc <> 0.
        CLOSE DATASET p_file.
        ROLLBACK WORK.
        gv_out = |Error: ship { gs_ship-ship_id } could not be written; nothing loaded|.
        WRITE / gv_out.
        RETURN.
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
    WRITE / gv_out.
    RETURN.
  ENDIF.
  COMMIT WORK.
  WRITE: / 'Loaded', gv_loaded, 'ships from', p_file.
ENDFORM.
