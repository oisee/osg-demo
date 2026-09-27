REPORT zosd_fleet_alv.
* The Airship fleet as a classic ALV (CL_SALV_TABLE): one row per ship with
* its status text (README chapter 2, step 6).
*
* Written for the open-steamgate report converter, which turns a classic
* report into a class and runs it as transaction ZGUI_OSD_FLEET_ALV. Three
* things here are that way on purpose:
* - the row types use built-in types, not DDIC fields: the converter is not
*   given the dictionary, and refuses a TYPE ... zosd_fleet_ship-name;
* - the LOOP changes a row with MODIFY ... INDEX: the short form MODIFY
*   gt_rows FROM gs_row runs as an Open SQL MODIFY after conversion;
* - no global field-symbol: the converter refuses one.
* On a system all three are plain ABAP and the report runs as it is.

TYPES: BEGIN OF ty_row,
         ship_id   TYPE c LENGTH 4,
         name      TYPE c LENGTH 30,
         status    TYPE c LENGTH 1,
         text      TYPE c LENGTH 20,
         steam_pct TYPE i,
         home_port TYPE c LENGTH 20,
       END OF ty_row.
TYPES: BEGIN OF ty_stat,
         status TYPE c LENGTH 1,
         text   TYPE c LENGTH 20,
       END OF ty_stat.

DATA gt_rows  TYPE STANDARD TABLE OF ty_row WITH DEFAULT KEY.
DATA gt_stat  TYPE STANDARD TABLE OF ty_stat WITH DEFAULT KEY.
DATA gs_stat  TYPE ty_stat.
DATA go_alv   TYPE REF TO cl_salv_table.
DATA gx_salv  TYPE REF TO cx_salv_msg.
DATA gs_row   TYPE ty_row.
DATA gv_index TYPE i.

START-OF-SELECTION.
  SELECT ship_id name status steam_pct home_port
    FROM zosd_fleet_ship
    INTO CORRESPONDING FIELDS OF TABLE gt_rows
    ORDER BY ship_id.
  SELECT status text FROM zosd_fleet_stat INTO CORRESPONDING FIELDS OF TABLE gt_stat.
  LOOP AT gt_rows INTO gs_row.
    gv_index = sy-tabix.
    READ TABLE gt_stat INTO gs_stat WITH KEY status = gs_row-status.
    IF sy-subrc = 0.
      gs_row-text = gs_stat-text.
      MODIFY gt_rows FROM gs_row INDEX gv_index.
    ENDIF.
  ENDLOOP.

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
