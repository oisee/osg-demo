CLASS zcl_osd_fleet_watch_glass DEFINITION PUBLIC FINAL CREATE PUBLIC.
* Chapter 17: a person breaks the glass. The latest run of the watch set
* stopped at its budget (state GLASS); this continues it with a budget one
* higher and a reason, which continue_glass( ) writes into the run's events
* with the user and the time, then resumes the run.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    CONSTANTS c_reason TYPE string VALUE 'S004 known: maintenance planned, owner informed'.
ENDCLASS.

CLASS zcl_osd_fleet_watch_glass IMPLEMENTATION.

  METHOD if_oo_adt_classrun~main.
    DATA lv_run TYPE zosd_l3_stage-run_id.
    DATA ls_budget TYPE zosd_l3_budget.
    DATA lv_ok TYPE abap_bool.
    lv_run = zcl_osd_fleet_watch_state=>latest( ).
    SELECT SINGLE * FROM zosd_l3_budget INTO ls_budget WHERE run_id = lv_run.
    IF sy-subrc <> 0 OR ls_budget-state <> 'GLASS'.
      out->write( |Run { lv_run } is not at its glass: { ls_budget-state }| ).
      RETURN.
    ENDIF.
    lv_ok = zcl_osd_fleet_watch=>continue_glass( iv_run = lv_run
                                                 iv_new_glass = ls_budget-glass + 1
                                                 iv_reason = c_reason ).
    COMMIT WORK.
    out->write( |Continue run { lv_run } with glass { ls_budget-glass + 1 }: { lv_ok }| ).
  ENDMETHOD.

ENDCLASS.
