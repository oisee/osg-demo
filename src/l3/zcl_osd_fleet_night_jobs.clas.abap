CLASS zcl_osd_fleet_night_jobs DEFINITION PUBLIC FINAL CREATE PUBLIC.
* Chapter 16: the night set in background jobs, mode P, for 2026-10-01. The
* run plans stage 1 and submits one job per pile; the jobs run on their own,
* and the job that finishes the last pile of a stage opens the next one.
* ZCL_OSD_FLEET_NIGHT_STATE shows where the run has got to.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS zcl_osd_fleet_night_jobs IMPLEMENTATION.

  METHOD if_oo_adt_classrun~main.
    DATA ls_result TYPE zcl_osd_fleet_night=>ty_result.
    DATA lt_lines TYPE string_table.
    DATA lv_line TYPE string.
    ls_result = zcl_osd_fleet_night=>run( iv_date = zcl_osd_fleet_night_run=>c_date
                                          iv_mode = zcl_osd_fleet_night=>c_parallel ).
    COMMIT WORK.
    out->write( |Night set, mode P, run { ls_result-run_id }: { ls_result-status }| ).
    lt_lines = zcl_osd_fleet_night_run=>describe( ls_result-run_id ).
    LOOP AT lt_lines INTO lv_line.
      out->write( lv_line ).
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
