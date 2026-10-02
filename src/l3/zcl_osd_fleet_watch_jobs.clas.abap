CLASS zcl_osd_fleet_watch_jobs DEFINITION PUBLIC FINAL CREATE PUBLIC.
* Chapter 17: the watch set (src/l3/fleet_watch.l3.yaml), the night set with
* a governor, run in background jobs (mode P) for 2026-10-01. The run plans
* stage 1 and submits its piles; ZCL_OSD_FLEET_WATCH_STATE shows where the
* run and its budget have got to.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS zcl_osd_fleet_watch_jobs IMPLEMENTATION.

  METHOD if_oo_adt_classrun~main.
    DATA ls_result TYPE zcl_osd_fleet_watch=>ty_result.
    ls_result = zcl_osd_fleet_watch=>run( iv_date = zcl_osd_fleet_night_run=>c_date
                                          iv_mode = zcl_osd_fleet_watch=>c_parallel ).
    COMMIT WORK.
    out->write( |Watch set, mode P, run { ls_result-run_id }: { ls_result-status }| ).
  ENDMETHOD.

ENDCLASS.
