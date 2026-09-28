CLASS zcl_osd_fleet_bal_view DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    TYPES ty_run_id TYPE c LENGTH 100.
    TYPES tt_line TYPE STANDARD TABLE OF string WITH EMPTY KEY.
    CLASS-METHODS render
      IMPORTING iv_run_id TYPE ty_run_id OPTIONAL
                iv_errors_only TYPE abap_bool DEFAULT abap_false
      RETURNING VALUE(rt_lines) TYPE tt_line
      RAISING cx_bali_runtime.
ENDCLASS.

CLASS zcl_osd_fleet_bal_view IMPLEMENTATION.
  METHOD render.
    DATA lv_count TYPE i.
    DATA(lo_filter) = cl_bali_log_filter=>create( ).
    lo_filter = lo_filter->set_descriptor(
      object = 'ZOSD_FLEET' subobject = 'AUDIT'
      external_id = iv_run_id ).
    DATA(lo_db) = cl_bali_log_db=>get_instance( ).
    DATA(lt_logs) = lo_db->load_logs_via_filter( filter = lo_filter ).
    LOOP AT lt_logs INTO DATA(lo_log).
      DATA(lo_loaded) = lo_db->load_log( handle = lo_log->get_handle( ) ).
      DATA(lo_header) = lo_loaded->get_header( ).
      IF iv_errors_only = abap_true AND lo_header->number_error_items = 0.
        CONTINUE.
      ENDIF.
      lv_count = lv_count + 1.
      APPEND |Run { lo_header->external_id }; handle { lo_loaded->get_handle( ) }; errors { lo_header->number_error_items }| TO rt_lines.
      LOOP AT lo_loaded->get_all_items( ) INTO DATA(ls_entry).
        APPEND |{ ls_entry-log_item_number } { ls_entry-item->severity } { ls_entry-item->get_message_text( ) }| TO rt_lines.
      ENDLOOP.
    ENDLOOP.
    INSERT |Fleet audit logs: { lv_count }| INTO rt_lines INDEX 1.
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
