CLASS ltcl_bal DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL DANGEROUS.
  PRIVATE SECTION.
    METHODS error_filter_reads_messages FOR TESTING RAISING cx_static_check.
ENDCLASS.

CLASS ltcl_bal IMPLEMENTATION.
  METHOD error_filter_reads_messages.
    DATA lv_run_id TYPE zcl_osd_fleet_bal=>ty_run_id.
    lv_run_id = cl_system_uuid=>create_uuid_c32_static( ).
    DATA(lv_ok) = zcl_osd_fleet_bal=>record( iv_run_id = lv_run_id ).
    DATA(lv_error) = zcl_osd_fleet_bal=>record(
      iv_run_id = lv_run_id iv_expected_ships = 7 ).
    cl_abap_unit_assert=>assert_differs( act = lv_ok exp = lv_error ).

    DATA(lt_lines) = zcl_osd_fleet_bal_view=>render(
      iv_run_id = lv_run_id iv_errors_only = abap_true ).
    DATA(lt_info) = zcl_osd_fleet_bal_view=>render(
      iv_run_id = lv_run_id iv_severity = 'I' ).
    cl_abap_unit_assert=>assert_equals( act = lines( lt_info ) exp = 9 ).
    cl_abap_unit_assert=>assert_equals( act = lines( lt_lines ) exp = 5 ).
    READ TABLE lt_lines INDEX 1 INTO DATA(lv_count).
    READ TABLE lt_lines INDEX 2 INTO DATA(lv_header).
    READ TABLE lt_lines INDEX 3 INTO DATA(lv_started).
    READ TABLE lt_lines INDEX 4 INTO DATA(lv_observed).
    READ TABLE lt_lines INDEX 5 INTO DATA(lv_finished).
    cl_abap_unit_assert=>assert_equals( act = lv_count exp = 'Fleet audit logs: 1' ).
    cl_abap_unit_assert=>assert_char_cp( act = lv_header exp = '*errors 1*' ).
    cl_abap_unit_assert=>assert_char_cp( act = lv_started exp = '1 S Fleet audit started; UTC 20*' ).
    cl_abap_unit_assert=>assert_char_cp( act = lv_observed exp = '2 I Observed 6 ships and 20 voyages; UTC 20*' ).
    cl_abap_unit_assert=>assert_char_cp( act = lv_finished exp = '3 E Fleet audit failed:*; UTC 20*' ).
  ENDMETHOD.
ENDCLASS.
