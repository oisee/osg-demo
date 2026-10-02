CLASS zcl_osd_fleet_night_state DEFINITION PUBLIC FINAL CREATE PUBLIC.
* Chapter 16: the latest run of the night set in jobs for 2026-10-01 (a run
* with piles in jobs, whose first stage opened last): its gates, piles,
* worklist and alerts, while its jobs run and after.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS zcl_osd_fleet_night_state IMPLEMENTATION.

  METHOD if_oo_adt_classrun~main.
    DATA lt_stages TYPE STANDARD TABLE OF zosd_l3_stage WITH DEFAULT KEY.
    DATA ls_stage TYPE zosd_l3_stage.
    DATA lt_piles TYPE STANDARD TABLE OF zosd_l3_pile WITH DEFAULT KEY.
    DATA lt_lines TYPE string_table.
    DATA lv_line TYPE string.
    DATA lv_found TYPE abap_bool.
    SELECT * FROM zosd_l3_pile INTO TABLE lt_piles
      WHERE set_name = zcl_osd_fleet_night=>c_set
        AND check_date = zcl_osd_fleet_night_run=>c_date
        AND job_name <> space.
    SELECT * FROM zosd_l3_stage INTO TABLE lt_stages
      WHERE set_name = zcl_osd_fleet_night=>c_set
        AND check_date = zcl_osd_fleet_night_run=>c_date
        AND stage_no = 1.
    SORT lt_stages BY opened DESCENDING.
    LOOP AT lt_stages INTO ls_stage.
      READ TABLE lt_piles WITH KEY run_id = ls_stage-run_id TRANSPORTING NO FIELDS.
      IF sy-subrc = 0.
        lv_found = abap_true.
        EXIT.
      ENDIF.
    ENDLOOP.
    IF lv_found = abap_false.
      out->write( |No run of the night set in jobs for { zcl_osd_fleet_night_run=>c_date }| ).
      RETURN.
    ENDIF.
    out->write( |Night set, run { ls_stage-run_id }| ).
    lt_lines = zcl_osd_fleet_night_run=>describe( ls_stage-run_id ).
    LOOP AT lt_lines INTO lv_line.
      out->write( lv_line ).
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
