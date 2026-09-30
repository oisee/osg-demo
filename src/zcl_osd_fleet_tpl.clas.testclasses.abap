CLASS ltcl_fleet_tpl DEFINITION FINAL FOR TESTING
  DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    METHODS one_line_per_ship FOR TESTING RAISING cx_static_check.
    METHODS trace_points_at_the_ship FOR TESTING RAISING cx_static_check.
ENDCLASS.

CLASS ltcl_fleet_tpl IMPLEMENTATION.
  METHOD one_line_per_ship.
    DATA(ls_result) = zcl_osd_fleet_tpl=>render( ).
    cl_abap_unit_assert=>assert_equals( exp = 8 act = lines( ls_result-lines ) ).
    cl_abap_unit_assert=>assert_equals( exp = `Fleet report: 6 airships` act = ls_result-lines[ 1 ] ).
    cl_abap_unit_assert=>assert_equals(
      exp = `S001 Albatross    Aloft       steam 82%` act = ls_result-lines[ 2 ] ).
    cl_abap_unit_assert=>assert_equals(
      exp = `S006 Old Boiler   Maintenance steam 0%` act = ls_result-lines[ 7 ] ).
  ENDMETHOD.

  METHOD trace_points_at_the_ship.
    DATA(ls_result) = zcl_osd_fleet_tpl=>render( ).
    READ TABLE ls_result-trace WITH KEY line = 4 INTO DATA(ls_trace).
    cl_abap_unit_assert=>assert_subrc( exp = 0 ).
    cl_abap_unit_assert=>assert_equals( exp = `fleet` act = ls_trace-template ).
    cl_abap_unit_assert=>assert_equals( exp = 3 act = ls_trace-template_line ).
    cl_abap_unit_assert=>assert_equals( exp = `/airships/3/id` act = ls_trace-path ).
  ENDMETHOD.
ENDCLASS.
