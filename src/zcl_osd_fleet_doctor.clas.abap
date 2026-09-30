CLASS zcl_osd_fleet_doctor DEFINITION PUBLIC FINAL CREATE PUBLIC.
* Which fleet chains wait, and why. Finds every readiness job
* (ZCL_OSD_FLEET_CHAIN) that still waits, asks open-steamgate's job doctor
* ZCL_OSD_JOB_DOCTOR about it and about the voyage job of the same run (the
* job that should raise the event it waits for), and puts
* the voyage step's BAL log for the same run next to that. The job doctor
* has no BAL link of its own; the run ID from the step input is the link.
* Whether a waiting chain is stuck is the voyage job's state: FAILED means it
* will not move; QUEUED or RUNNING means it is still on its way.
* ZCL_OSD_JOB_DOCTOR is open-steamgate's, so this class stays local.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    TYPES ty_lines TYPE STANDARD TABLE OF string WITH DEFAULT KEY.
    TYPES: BEGIN OF ty_job,
             jobname  TYPE tbtcjob-jobname,
             jobcount TYPE tbtcjob-jobcount,
           END OF ty_job,
           tt_jobs TYPE STANDARD TABLE OF ty_job WITH DEFAULT KEY.
* Readiness jobs of the current user that still wait for their event.
    CLASS-METHODS waiting_chains
      RETURNING VALUE(rt_jobs) TYPE tt_jobs.
* The diagnosis of one waiting readiness job.
    CLASS-METHODS diagnose
      IMPORTING is_job TYPE ty_job
      RETURNING VALUE(rt_lines) TYPE ty_lines.
  PRIVATE SECTION.
    CLASS-METHODS doctor
      IMPORTING iv_jobname TYPE csequence
                iv_jobcount TYPE csequence
      RETURNING VALUE(rt_lines) TYPE ty_lines.
    CLASS-METHODS voyage_job
      IMPORTING iv_run TYPE string
      EXPORTING es_job TYPE ty_job
                et_lines TYPE ty_lines.
    CLASS-METHODS value_after
      IMPORTING it_lines TYPE ty_lines
                iv_prefix TYPE string
      RETURNING VALUE(rv_value) TYPE string.
ENDCLASS.

CLASS zcl_osd_fleet_doctor IMPLEMENTATION.
  METHOD waiting_chains.
    DATA ls_select TYPE btcselect.
    DATA lt_found TYPE STANDARD TABLE OF tbtcjob WITH DEFAULT KEY.
    ls_select-jobname = zcl_osd_fleet_chain=>c_ready_job.
    ls_select-username = sy-uname.
    ls_select-scheduled = 'X'.
    CALL FUNCTION 'BP_JOB_SELECT'
      EXPORTING jobselect_dialog = 'N' jobsel_param_in = ls_select
      TABLES jobselect_joblist = lt_found
      EXCEPTIONS OTHERS = 1.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    LOOP AT lt_found INTO DATA(ls_found).
      APPEND VALUE #( jobname = ls_found-jobname jobcount = ls_found-jobcount ) TO rt_jobs.
    ENDLOOP.
    SORT rt_jobs BY jobcount.
  ENDMETHOD.

  METHOD diagnose.
    DATA lt_ready TYPE ty_lines.
    DATA lt_voyage TYPE ty_lines.
    DATA ls_voyage TYPE ty_job.
    lt_ready = doctor( iv_jobname = is_job-jobname iv_jobcount = is_job-jobcount ).
    DATA(lv_run) = value_after( it_lines = lt_ready iv_prefix = `  P_RUN=` ).
    DATA(lv_event) = value_after( it_lines = lt_ready iv_prefix = `Wait: event ` ).
    APPEND |Waiting chain { lv_run }: { is_job-jobname }/{ is_job-jobcount }|
        && | waits for event { lv_event }| TO rt_lines.
    IF lv_run IS INITIAL.
      APPEND `No run ID (P_RUN) in the readiness job's step input` TO rt_lines.
    ENDIF.
    APPEND `-- job doctor, readiness job` TO rt_lines.
    APPEND LINES OF lt_ready TO rt_lines.
    IF lv_run IS INITIAL.
      RETURN.
    ENDIF.
    voyage_job( EXPORTING iv_run = lv_run IMPORTING es_job = ls_voyage et_lines = lt_voyage ).
    IF ls_voyage IS INITIAL.
      APPEND `-- no voyage job for this run` TO rt_lines.
    ELSE.
      APPEND |-- job doctor, voyage job { ls_voyage-jobname }/{ ls_voyage-jobcount } of the same run|
        TO rt_lines.
      APPEND LINES OF lt_voyage TO rt_lines.
    ENDIF.
    APPEND |-- business log { lv_run }-VOY| TO rt_lines.
    TRY.
        DATA(lt_bal) = zcl_osd_fleet_bal_view=>render( iv_run_id = CONV #( |{ lv_run }-VOY| ) ).
        IF lines( lt_bal ) <= 1.
          APPEND `No business log for this run` TO rt_lines.
        ENDIF.
        APPEND LINES OF lt_bal TO rt_lines.
      CATCH cx_bali_runtime INTO DATA(lx_bal).
        APPEND |No business log: { lx_bal->get_text( ) }| TO rt_lines.
    ENDTRY.
  ENDMETHOD.

  METHOD voyage_job.
    DATA ls_select TYPE btcselect.
    DATA lt_found TYPE STANDARD TABLE OF tbtcjob WITH DEFAULT KEY.
    DATA lt_lines TYPE ty_lines.
    ls_select-jobname = zcl_osd_fleet_chain=>c_voyage_job.
    ls_select-username = sy-uname.
    ls_select-preliminary = 'X'.
    ls_select-scheduled = 'X'.
    ls_select-ready = 'X'.
    ls_select-running = 'X'.
    ls_select-finished = 'X'.
    ls_select-aborted = 'X'.
    CALL FUNCTION 'BP_JOB_SELECT'
      EXPORTING jobselect_dialog = 'N' jobsel_param_in = ls_select
      TABLES jobselect_joblist = lt_found
      EXCEPTIONS OTHERS = 1.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    LOOP AT lt_found INTO DATA(ls_found).
      lt_lines = doctor( iv_jobname = ls_found-jobname iv_jobcount = ls_found-jobcount ).
      IF value_after( it_lines = lt_lines iv_prefix = `  P_RUN=` ) = iv_run.
        es_job = VALUE #( jobname = ls_found-jobname jobcount = ls_found-jobcount ).
        et_lines = lt_lines.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD doctor.
    DATA lv_name TYPE string.
    DATA lv_count TYPE string.
    lv_name = iv_jobname.
    lv_count = iv_jobcount.
    rt_lines = zcl_osd_job_doctor=>inspect( iv_jobname = lv_name iv_jobcount = lv_count ).
  ENDMETHOD.

  METHOD value_after.
    DATA lv_length TYPE i.
    lv_length = strlen( iv_prefix ).
    LOOP AT it_lines INTO DATA(lv_line).
      IF strlen( lv_line ) > lv_length AND lv_line(lv_length) = iv_prefix.
        rv_value = lv_line+lv_length.
        CONDENSE rv_value.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.
    DATA(lt_jobs) = waiting_chains( ).
    out->write( |Fleet chains waiting: { lines( lt_jobs ) }| ).
    LOOP AT lt_jobs INTO DATA(ls_job).
      LOOP AT diagnose( ls_job ) INTO DATA(lv_line).
        out->write( lv_line ).
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.
