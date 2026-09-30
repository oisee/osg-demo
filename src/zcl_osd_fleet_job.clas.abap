CLASS zcl_osd_fleet_job DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    TYPES ty_run_id TYPE c LENGTH 32.
    TYPES: BEGIN OF ty_job,
             jobname  TYPE tbtcjob-jobname,
             jobcount TYPE tbtcjob-jobcount,
             run_id   TYPE ty_run_id,
           END OF ty_job.
    CONSTANTS c_jobname TYPE tbtcjob-jobname VALUE 'ZOSD_FLEET_AUDIT'.
* Opens a job, submits ZOSD_FLEET_JOB with the run ID and the expected
* ship count and releases it for an immediate start. The caller commits; a
* worker runs the step afterwards.
    CLASS-METHODS schedule
      IMPORTING iv_run_id TYPE ty_run_id
                iv_expected_ships TYPE i DEFAULT 6
      RETURNING VALUE(rs_job) TYPE ty_job.
ENDCLASS.

CLASS zcl_osd_fleet_job IMPLEMENTATION.
  METHOD schedule.
    DATA lv_released TYPE btch0000-char1.
    DATA lv_jobname TYPE string.
    DATA lv_jobcount TYPE string.
    rs_job-jobname = c_jobname.
    rs_job-run_id = iv_run_id.
    CALL FUNCTION 'JOB_OPEN'
      EXPORTING jobname = rs_job-jobname
      IMPORTING jobcount = rs_job-jobcount.
    lv_jobname = rs_job-jobname.
    lv_jobcount = rs_job-jobcount.
    SUBMIT zosd_fleet_job
      WITH p_run = iv_run_id
      WITH p_ships = iv_expected_ships
      VIA JOB lv_jobname NUMBER lv_jobcount AND RETURN.
    CALL FUNCTION 'JOB_CLOSE'
      EXPORTING jobname = rs_job-jobname jobcount = rs_job-jobcount
                strtimmed = 'X'
      IMPORTING job_was_released = lv_released.
    IF lv_released <> 'X'.
      CLEAR rs_job-jobcount.
    ENDIF.
  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.
    TRY.
        DATA(lv_run) = CONV ty_run_id( cl_system_uuid=>create_uuid_c32_static( ) ).
      CATCH cx_uuid_error.
        out->write( 'Fleet job not scheduled: could not create a run ID' ).
        RETURN.
    ENDTRY.
    DATA(ls_job) = schedule( lv_run ).
    IF ls_job-jobcount IS INITIAL.
      ROLLBACK WORK.
      out->write( |Fleet job { lv_run } was not released| ).
      RETURN.
    ENDIF.
    COMMIT WORK.
    out->write( |Fleet job { ls_job-jobname } { ls_job-jobcount } released; run { lv_run }| ).
  ENDMETHOD.
ENDCLASS.
