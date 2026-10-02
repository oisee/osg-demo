CLASS zcl_osd_fleet_night_schedule DEFINITION PUBLIC FINAL CREATE PUBLIC.
* Chapter 16: the night set as a periodic job, switched on and off. When the
* set is not scheduled, SCHEDULE releases the driver L3_NIGHT_D (every day at
* 02:00, system time), and a second call finds the waiting instance and
* schedules nothing more. When it is, UNSCHEDULE deletes the waiting
* instance, which ends the chain.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS zcl_osd_fleet_night_schedule IMPLEMENTATION.

  METHOD if_oo_adt_classrun~main.
    DATA lv_count TYPE tbtcjob-jobcount.
    DATA lv_again TYPE tbtcjob-jobcount.
    DATA lv_deleted TYPE i.
    lv_count = zcl_osd_fleet_night=>scheduled( ).
    IF lv_count IS INITIAL.
      lv_count = zcl_osd_fleet_night=>schedule( ).
      COMMIT WORK.
      IF lv_count IS INITIAL.
        out->write( |Not scheduled: JOB_OPEN or JOB_CLOSE of { zcl_osd_fleet_night=>c_driver } failed| ).
        RETURN.
      ENDIF.
      lv_again = zcl_osd_fleet_night=>schedule( ).
      out->write( |Scheduled { zcl_osd_fleet_night=>c_driver } { lv_count }; again: { lv_again }| ).
    ELSE.
      lv_deleted = zcl_osd_fleet_night=>unschedule( ).
      COMMIT WORK.
      out->write( |Unscheduled { zcl_osd_fleet_night=>c_driver } { lv_count }: { lv_deleted } deleted| ).
    ENDIF.
    out->write( |Waiting: '{ zcl_osd_fleet_night=>scheduled( ) }'| ).
  ENDMETHOD.

ENDCLASS.
