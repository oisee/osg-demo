CLASS ltcl_audit DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    METHODS seeded_fleet FOR TESTING.
    METHODS mismatch_is_error FOR TESTING.
ENDCLASS.

CLASS ltcl_audit IMPLEMENTATION.
  METHOD seeded_fleet.
    DATA ls_result TYPE zcl_osd_fleet_audit=>ty_result.

    ls_result = zcl_osd_fleet_audit=>inspect( ).
    cl_abap_unit_assert=>assert_equals( act = ls_result-ship_count exp = 6 ).
    cl_abap_unit_assert=>assert_equals( act = ls_result-voyage_count exp = 20 ).
    cl_abap_unit_assert=>assert_equals( act = ls_result-severity exp = 'S' ).
  ENDMETHOD.

  METHOD mismatch_is_error.
    DATA ls_result TYPE zcl_osd_fleet_audit=>ty_result.

    ls_result = zcl_osd_fleet_audit=>inspect( iv_expected_ships = 7 ).
    cl_abap_unit_assert=>assert_equals( act = ls_result-severity exp = 'E' ).
    cl_abap_unit_assert=>assert_equals( act = ls_result-ship_count exp = 6 ).
    cl_abap_unit_assert=>assert_equals( act = ls_result-voyage_count exp = 20 ).
  ENDMETHOD.
ENDCLASS.
