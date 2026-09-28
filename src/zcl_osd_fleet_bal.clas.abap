CLASS zcl_osd_fleet_bal DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    TYPES ty_run_id TYPE c LENGTH 100.
    CLASS-METHODS record
      IMPORTING iv_run_id TYPE ty_run_id
                iv_expected_ships TYPE i DEFAULT 6
                iv_expected_voyages TYPE i DEFAULT 20
      RETURNING VALUE(rv_handle) TYPE string
      RAISING cx_bali_runtime.
ENDCLASS.

CLASS zcl_osd_fleet_bal IMPLEMENTATION.
  METHOD record.
    DATA(ls_result) = zcl_osd_fleet_audit=>inspect(
      iv_expected_ships = iv_expected_ships
      iv_expected_voyages = iv_expected_voyages ).
    DATA(lo_header) = cl_bali_header_setter=>create(
      object = 'ZOSD_FLEET' subobject = 'AUDIT'
      external_id = iv_run_id ).
    DATA(lo_log) = cl_bali_log=>create_with_header( header = lo_header ).
    lo_log->add_item( item = cl_bali_free_text_setter=>create(
      text = 'Fleet audit started' severity = 'S' ) ).
    lo_log->add_item( item = cl_bali_free_text_setter=>create(
      text = |Observed { ls_result-ship_count } ships and { ls_result-voyage_count } voyages|
      severity = 'I' ) ).
    lo_log->add_item( item = cl_bali_free_text_setter=>create(
      text = ls_result-message severity = ls_result-severity ) ).
    cl_bali_log_db=>get_instance( )->save_log( log = lo_log ).
    rv_handle = lo_log->get_handle( ).
  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.
    TRY.
        DATA(lv_batch_id) = cl_system_uuid=>create_uuid_c32_static( ).
        DATA(lv_first) = record( iv_run_id = |{ lv_batch_id }-OK1| ).
        DATA(lv_second) = record( iv_run_id = |{ lv_batch_id }-OK2| ).
        DATA(lv_error) = record( iv_run_id = |{ lv_batch_id }-ERR|
          iv_expected_ships = 7 ).
        COMMIT WORK.
        out->write( |BAL batch { lv_batch_id }: 2 success, 1 error| ).
        out->write( |OK1 { lv_first }| ).
        out->write( |OK2 { lv_second }| ).
        out->write( |ERR { lv_error }| ).
      CATCH cx_bali_runtime INTO DATA(lx_bal).
        ROLLBACK WORK.
        out->write( |BAL save failed: { lx_bal->get_text( ) }| ).
      CATCH cx_uuid_error.
        ROLLBACK WORK.
        out->write( 'BAL save failed: could not create a run ID' ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
