CLASS zcl_osd_fleet_bal_view DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    TYPES ty_run_id TYPE c LENGTH 100.
    TYPES tt_line TYPE STANDARD TABLE OF string WITH EMPTY KEY.
    TYPES: BEGIN OF ty_message,
             run_id   TYPE ty_run_id,
             item     TYPE i,
             severity TYPE symsgty,
             text     TYPE string,
             utc      TYPE c LENGTH 14,
           END OF ty_message,
           tt_message TYPE STANDARD TABLE OF ty_message WITH EMPTY KEY.
* Every message of the fleet audit logs, one row each, for a grid.
    CLASS-METHODS messages
      IMPORTING iv_run_id TYPE ty_run_id OPTIONAL
      RETURNING VALUE(rt_messages) TYPE tt_message
      RAISING cx_bali_runtime.
    CLASS-METHODS render
      IMPORTING iv_run_id TYPE ty_run_id OPTIONAL
                iv_severity TYPE symsgty OPTIONAL
                iv_errors_only TYPE abap_bool DEFAULT abap_false
      RETURNING VALUE(rt_lines) TYPE tt_line
      RAISING cx_bali_runtime.
ENDCLASS.

CLASS zcl_osd_fleet_bal_view IMPLEMENTATION.
  METHOD render.
    DATA lv_count TYPE i.
    DATA lv_filter_severity TYPE symsgty.
    DATA lv_matches TYPE abap_bool.
    lv_filter_severity = iv_severity.
    IF iv_errors_only = abap_true.
      lv_filter_severity = 'E'.
    ENDIF.
    DATA(lo_filter) = cl_bali_log_filter=>create( ).
    lo_filter = lo_filter->set_descriptor(
      object = 'ZOSD_FLEET' subobject = 'AUDIT'
      external_id = iv_run_id ).
    DATA(lo_db) = cl_bali_log_db=>get_instance( ).
    DATA(lt_logs) = lo_db->load_logs_via_filter( filter = lo_filter ).
    LOOP AT lt_logs INTO DATA(lo_log).
      DATA(lo_loaded) = lo_db->load_log( handle = lo_log->get_handle( ) ).
      DATA(lo_header) = lo_loaded->get_header( ).
      DATA(lt_items) = lo_loaded->get_all_items( ).
      IF lv_filter_severity IS NOT INITIAL.
        lv_matches = abap_false.
        LOOP AT lt_items INTO DATA(ls_filter_item).
          IF ls_filter_item-item->severity = lv_filter_severity.
            lv_matches = abap_true.
            EXIT.
          ENDIF.
        ENDLOOP.
      ELSE.
        lv_matches = abap_true.
      ENDIF.
      IF lv_matches = abap_false.
        CONTINUE.
      ENDIF.
      lv_count = lv_count + 1.
      APPEND |Run { lo_header->external_id }; handle { lo_loaded->get_handle( ) }; errors { lo_header->number_error_items }| TO rt_lines.
      LOOP AT lt_items INTO DATA(ls_entry).
        APPEND |{ ls_entry-log_item_number } { ls_entry-item->severity } { ls_entry-item->get_message_text( ) }; UTC { ls_entry-item->timestamp }| TO rt_lines.
      ENDLOOP.
    ENDLOOP.
    INSERT |Fleet audit logs: { lv_count }| INTO rt_lines INDEX 1.
  ENDMETHOD.

  METHOD messages.
    DATA ls_message TYPE ty_message.
    DATA(lo_filter) = cl_bali_log_filter=>create( ).
    lo_filter = lo_filter->set_descriptor(
      object = 'ZOSD_FLEET' subobject = 'AUDIT'
      external_id = iv_run_id ).
    DATA(lo_db) = cl_bali_log_db=>get_instance( ).
    DATA(lt_logs) = lo_db->load_logs_via_filter( filter = lo_filter ).
    LOOP AT lt_logs INTO DATA(lo_log).
      DATA(lo_loaded) = lo_db->load_log( handle = lo_log->get_handle( ) ).
      DATA(lo_header) = lo_loaded->get_header( ).
      DATA(lt_items) = lo_loaded->get_all_items( ).
      LOOP AT lt_items INTO DATA(ls_entry).
        CLEAR ls_message.
        ls_message-run_id = lo_header->external_id.
        ls_message-item = ls_entry-log_item_number.
        ls_message-severity = ls_entry-item->severity.
        ls_message-text = ls_entry-item->get_message_text( ).
        ls_message-utc = |{ ls_entry-item->timestamp }|.
        APPEND ls_message TO rt_messages.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.
    TRY.
        DATA(lt_lines) = render( ).
        LOOP AT lt_lines INTO DATA(lv_line).
          out->write( lv_line ).
        ENDLOOP.
      CATCH cx_bali_runtime INTO DATA(lx_bal).
        out->write( |Fleet BAL read failed: { lx_bal->get_text( ) }| ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
