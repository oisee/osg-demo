CLASS zcl_osd_fleet_chain DEFINITION PUBLIC FINAL CREATE PUBLIC.
* Two background jobs as one chain over the fleet. ZOSD_FLEET_READY is
* scheduled first and waits for the named event ZOSD_FLEET_VOYAGE_DONE with
* the run ID as its parameter; then ZOSD_FLEET_VOYAGE is released. The voyage
* step counts the voyages, records BAL log <run>-VOY and, only when the count
* matches and the log is committed, raises that event (BP_EVENT_RAISE). The
* readiness step checks the log and the ships and records <run>-READY. A
* count that differs from the expected one fails the voyage job and raises
* nothing, so the readiness job keeps waiting.
* The waiter exists before the raiser can run, so a fast voyage job cannot
* finish first; SAP and open-steamgate both drop a raise that comes before
* the waiting job was closed. Measured on open-steamgate; on a system this
* follows SAP's documented event pattern, not measured there. A job already
* started is not undone by the caller's ROLLBACK.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    TYPES ty_run_id TYPE c LENGTH 32.
    TYPES: BEGIN OF ty_chain,
             run_id         TYPE ty_run_id,
             voyage_jobname TYPE tbtcjob-jobname,
             voyage_count   TYPE tbtcjob-jobcount,
             ready_jobname  TYPE tbtcjob-jobname,
             ready_count    TYPE tbtcjob-jobcount,
             failed         TYPE string,
           END OF ty_chain.
    CONSTANTS c_voyage_job TYPE tbtcjob-jobname VALUE 'ZOSD_FLEET_VOYAGE'.
    CONSTANTS c_ready_job TYPE tbtcjob-jobname VALUE 'ZOSD_FLEET_READY'.
    CONSTANTS c_event TYPE c LENGTH 32 VALUE 'ZOSD_FLEET_VOYAGE_DONE'.
* Schedules both jobs; the caller commits. FAILED names the call that failed.
    CLASS-METHODS schedule
      IMPORTING iv_run_id TYPE ty_run_id
                iv_expected_voyages TYPE i DEFAULT 20
      RETURNING VALUE(rs_chain) TYPE ty_chain.
* The voyage step: returns abap_false when the count does not match. The
* log is saved either way; the caller commits it, then raises the event.
    CLASS-METHODS voyage_step
      IMPORTING iv_run_id TYPE ty_run_id
                iv_expected_voyages TYPE i
      RETURNING VALUE(rv_ok) TYPE abap_bool
      RAISING cx_bali_runtime.
* The readiness step: needs the run's voyage log without errors and the six
* ships; records the final result.
    CLASS-METHODS ready_step
      IMPORTING iv_run_id TYPE ty_run_id
      RETURNING VALUE(rv_ok) TYPE abap_bool
      RAISING cx_bali_runtime.
  PRIVATE SECTION.
    CLASS-METHODS new_log
      IMPORTING iv_external_id TYPE string
      RETURNING VALUE(ro_log) TYPE REF TO if_bali_log
      RAISING cx_bali_runtime.
    CLASS-METHODS add
      IMPORTING io_log TYPE REF TO if_bali_log
                iv_text TYPE string
                iv_severity TYPE symsgty
      RAISING cx_bali_runtime.
ENDCLASS.

CLASS zcl_osd_fleet_chain IMPLEMENTATION.
  METHOD schedule.
    DATA lv_released TYPE btch0000-char1.
    DATA lv_event_param TYPE c LENGTH 64.
* SUBMIT ... VIA JOB takes its job name and count as strings in OSD
    DATA lv_jobname TYPE string.
    DATA lv_jobcount TYPE string.
    rs_chain-run_id = iv_run_id.
    rs_chain-voyage_jobname = c_voyage_job.
    rs_chain-ready_jobname = c_ready_job.
    lv_event_param = iv_run_id.

* the waiter first: it must exist before the voyage job can raise the event
    CALL FUNCTION 'JOB_OPEN'
      EXPORTING jobname = rs_chain-ready_jobname
      IMPORTING jobcount = rs_chain-ready_count
      EXCEPTIONS OTHERS = 1.
    IF sy-subrc <> 0.
      rs_chain-failed = `JOB_OPEN ready`.
      RETURN.
    ENDIF.
    lv_jobname = rs_chain-ready_jobname.
    lv_jobcount = rs_chain-ready_count.
    SUBMIT zosd_fleet_ready
      WITH p_run = iv_run_id
      VIA JOB lv_jobname NUMBER lv_jobcount AND RETURN.
    IF sy-subrc <> 0.
      rs_chain-failed = `SUBMIT ready`.
      RETURN.
    ENDIF.
    CALL FUNCTION 'JOB_CLOSE'
      EXPORTING jobname = rs_chain-ready_jobname jobcount = rs_chain-ready_count
                event_id = c_event event_param = lv_event_param
      IMPORTING job_was_released = lv_released
      EXCEPTIONS OTHERS = 1.
    IF sy-subrc <> 0 OR lv_released <> 'X'.
      rs_chain-failed = `JOB_CLOSE ready`.
      RETURN.
    ENDIF.

    CALL FUNCTION 'JOB_OPEN'
      EXPORTING jobname = rs_chain-voyage_jobname
      IMPORTING jobcount = rs_chain-voyage_count
      EXCEPTIONS OTHERS = 1.
    IF sy-subrc <> 0.
      rs_chain-failed = `JOB_OPEN voyage`.
      RETURN.
    ENDIF.
    lv_jobname = rs_chain-voyage_jobname.
    lv_jobcount = rs_chain-voyage_count.
    SUBMIT zosd_fleet_voyage
      WITH p_run = iv_run_id
      WITH p_voys = iv_expected_voyages
      VIA JOB lv_jobname NUMBER lv_jobcount AND RETURN.
    IF sy-subrc <> 0.
      rs_chain-failed = `SUBMIT voyage`.
      RETURN.
    ENDIF.
    CLEAR lv_released.
    CALL FUNCTION 'JOB_CLOSE'
      EXPORTING jobname = rs_chain-voyage_jobname jobcount = rs_chain-voyage_count
                strtimmed = 'X'
      IMPORTING job_was_released = lv_released
      EXCEPTIONS OTHERS = 1.
    IF sy-subrc <> 0 OR lv_released <> 'X'.
      rs_chain-failed = `JOB_CLOSE voyage`.
    ENDIF.
  ENDMETHOD.

  METHOD voyage_step.
    DATA lt_ship_ids TYPE STANDARD TABLE OF zosd_fleet_voy-ship_id WITH DEFAULT KEY.
    DATA lv_voyages TYPE i.
    DATA lv_ships TYPE i.
    SELECT ship_id FROM zosd_fleet_voy INTO TABLE lt_ship_ids.
    lv_voyages = lines( lt_ship_ids ).
    SORT lt_ship_ids.
    DELETE ADJACENT DUPLICATES FROM lt_ship_ids.
    lv_ships = lines( lt_ship_ids ).
    DATA(lo_log) = new_log( |{ iv_run_id }-VOY| ).
    add( io_log = lo_log iv_text = `Voyage step started` iv_severity = 'S' ).
    add( io_log = lo_log iv_severity = 'I'
         iv_text = |Counted { lv_voyages } voyages over { lv_ships } ships| ).
    rv_ok = xsdbool( lv_voyages = iv_expected_voyages ).
    IF rv_ok = abap_true.
      add( io_log = lo_log iv_severity = 'S'
           iv_text = |Voyage step OK: { lv_voyages } voyages| ).
    ELSE.
      add( io_log = lo_log iv_severity = 'E'
           iv_text = |Voyage step failed: { lv_voyages } voyages, expected { iv_expected_voyages }| ).
    ENDIF.
    cl_bali_log_db=>get_instance( )->save_log( log = lo_log ).
  ENDMETHOD.

  METHOD ready_step.
    DATA lv_voyage_errors TYPE i VALUE -1.
    DATA lv_ships TYPE i.
    DATA(lo_filter) = cl_bali_log_filter=>create( ).
    lo_filter = lo_filter->set_descriptor(
      object = 'ZOSD_FLEET' subobject = 'AUDIT'
      external_id = CONV #( |{ iv_run_id }-VOY| ) ).
    DATA(lo_db) = cl_bali_log_db=>get_instance( ).
    DATA(lt_logs) = lo_db->load_logs_via_filter( filter = lo_filter ).
* exactly one voyage log per run; a repeated voyage job makes it ambiguous
    IF lines( lt_logs ) = 1.
      DATA(lo_voyage) = lo_db->load_log( handle = lt_logs[ 1 ]->get_handle( ) ).
      DATA(lo_header) = lo_voyage->get_header( ).
      lv_voyage_errors = lo_header->number_error_items.
    ENDIF.
    SELECT COUNT( * ) FROM zosd_fleet_ship INTO lv_ships.
    DATA(lo_log) = new_log( |{ iv_run_id }-READY| ).
    add( io_log = lo_log iv_text = `Readiness step started` iv_severity = 'S' ).
    add( io_log = lo_log iv_severity = 'I'
         iv_text = |Voyage logs { lines( lt_logs ) }, errors { lv_voyage_errors }; { lv_ships } ships| ).
    rv_ok = xsdbool( lv_voyage_errors = 0 AND lv_ships = 6 ).
    IF rv_ok = abap_true.
      add( io_log = lo_log iv_severity = 'S'
           iv_text = |Fleet ready: { lv_ships } ships after a clean voyage step| ).
    ELSE.
      add( io_log = lo_log iv_severity = 'E'
           iv_text = `Fleet not ready: not exactly one clean voyage log, or not 6 ships` ).
    ENDIF.
    cl_bali_log_db=>get_instance( )->save_log( log = lo_log ).
  ENDMETHOD.

  METHOD new_log.
    ro_log = cl_bali_log=>create_with_header( header = cl_bali_header_setter=>create(
      object = 'ZOSD_FLEET' subobject = 'AUDIT' external_id = CONV #( iv_external_id ) ) ).
  ENDMETHOD.

  METHOD add.
    io_log->add_item( item = cl_bali_free_text_setter=>create(
      text = CONV #( iv_text ) severity = iv_severity ) ).
  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.
    DATA lv_run TYPE ty_run_id.
    DATA lv_expected TYPE i.
    DATA lv_label TYPE string.
    DO 2 TIMES.
      IF sy-index = 1.
        lv_expected = 20.
        lv_label = `ok`.
      ELSE.
        lv_expected = 21.
        lv_label = `forced failure`.
      ENDIF.
      TRY.
          lv_run = cl_system_uuid=>create_uuid_c32_static( ).
        CATCH cx_uuid_error.
          out->write( 'Fleet chain not scheduled: could not create a run ID' ).
          RETURN.
      ENDTRY.
      DATA(ls_chain) = schedule( iv_run_id = lv_run iv_expected_voyages = lv_expected ).
      IF ls_chain-failed IS NOT INITIAL.
        ROLLBACK WORK.
        out->write( |Fleet chain { lv_run } not scheduled: { ls_chain-failed } failed| ).
        RETURN.
      ENDIF.
      COMMIT WORK.
      out->write( |Fleet chain { lv_label }: run { lv_run }; voyage job { ls_chain-voyage_count }; |
               && |ready job { ls_chain-ready_count } waits for { c_event }; expecting { lv_expected } voyages| ).
    ENDDO.
  ENDMETHOD.
ENDCLASS.
