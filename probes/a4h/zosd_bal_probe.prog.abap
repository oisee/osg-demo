REPORT zosd_bal_probe.
* Disposable A4H probe only. Not part of the osg-demo pack.
* Register BAL object ZOSD_FLEET / subobject AUDIT before running.
* Modes: W=save+commit, X=save+rollback, S=second connection+rollback,
*        D=save two logs with one external ID+commit, R=read from a new run.

PARAMETERS p_mode TYPE c LENGTH 1 DEFAULT 'R'.
PARAMETERS p_run TYPE balnrext.
PARAMETERS p_sev TYPE symsgty DEFAULT 'S'.

CLASS lcl_probe DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-METHODS save_one
      IMPORTING iv_run TYPE balnrext
                iv_severity TYPE symsgty
                iv_second TYPE abap_bool
      RETURNING VALUE(rv_handle) TYPE balloghndl
      RAISING cx_bali_runtime.
    CLASS-METHODS read_one
      IMPORTING iv_run TYPE balnrext
      RAISING cx_bali_runtime.
ENDCLASS.

CLASS lcl_probe IMPLEMENTATION.
  METHOD save_one.
    DATA(lo_header) = cl_bali_header_setter=>create(
      object = 'ZOSD_FLEET'
      subobject = 'AUDIT'
      external_id = iv_run ).
    DATA(lo_log) = cl_bali_log=>create_with_header( header = lo_header ).

    lo_log->add_item( item = cl_bali_free_text_setter=>create(
      text = 'Fleet audit started' severity = 'S' ) ).
    lo_log->add_item( item = cl_bali_free_text_setter=>create(
      text = 'Observed 6 ships and 20 voyages' severity = 'I' ) ).
    lo_log->add_item( item = cl_bali_free_text_setter=>create(
      text = 'Fleet audit finished' severity = iv_severity ) ).

    DATA(lo_db) = cl_bali_log_db=>get_instance( ).
    IF iv_second = abap_true.
      lo_db->save_log_2nd_db_connection( log = lo_log ).
    ELSE.
      lo_db->save_log( log = lo_log ).
    ENDIF.
    rv_handle = lo_log->get_handle( ).
  ENDMETHOD.

  METHOD read_one.
    DATA(lo_filter) = cl_bali_log_filter=>create( ).
    lo_filter = lo_filter->set_descriptor(
      object = 'ZOSD_FLEET' subobject = 'AUDIT' external_id = iv_run ).
    DATA(lo_db) = cl_bali_log_db=>get_instance( ).
    DATA(lt_logs) = lo_db->load_logs_via_filter( filter = lo_filter ).

    WRITE: / 'Matching logs:', lines( lt_logs ).
    LOOP AT lt_logs INTO DATA(lo_log).
      DATA(lv_handle) = lo_log->get_handle( ).
      DATA(lo_loaded) = lo_db->load_log( handle = lv_handle ).
      DATA(lo_header) = lo_loaded->get_header( ).
      WRITE: / 'Handle:', lv_handle,
             / 'External ID:', lo_header->external_id,
             / 'Error items:', lo_header->number_error_items.
      LOOP AT lo_loaded->get_all_items( ) INTO DATA(ls_entry).
        DATA(lv_text) = ls_entry-item->get_message_text( ).
        WRITE: / ls_entry-log_item_number,
                 ls_entry-item->severity,
                 lv_text.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.

START-OF-SELECTION.
  IF p_run IS INITIAL.
    WRITE / 'Supply a unique probe run ID in P_RUN'.
    RETURN.
  ENDIF.

  TRY.
      CASE p_mode.
        WHEN 'W' OR 'X' OR 'S' OR 'D'.
          DATA(lv_handle) = lcl_probe=>save_one(
            iv_run = p_run iv_severity = p_sev
            iv_second = COND abap_bool( WHEN p_mode = 'S'
                                        THEN abap_true ELSE abap_false ) ).
          WRITE: / 'Saved handle:', lv_handle.

          IF p_mode = 'D'.
            lv_handle = lcl_probe=>save_one(
              iv_run = p_run iv_severity = p_sev iv_second = abap_false ).
            WRITE: / 'Second handle:', lv_handle.
          ENDIF.

          IF p_mode = 'X' OR p_mode = 'S'.
            ROLLBACK WORK.
            WRITE / 'Caller rolled back; read again in a fresh session'.
          ELSE.
            COMMIT WORK.
            WRITE / 'Caller committed; read again in a fresh session'.
          ENDIF.
        WHEN 'R'.
          lcl_probe=>read_one( iv_run = p_run ).
        WHEN OTHERS.
          WRITE / 'Use mode W, X, S, D or R'.
      ENDCASE.
    CATCH cx_bali_runtime INTO DATA(lx_bal).
      WRITE: / 'BAL error:', lx_bal->get_text( ).
  ENDTRY.
