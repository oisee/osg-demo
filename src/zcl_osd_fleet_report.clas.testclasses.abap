CLASS ltcl_fleet DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    METHODS line_of
      IMPORTING
        iv_ship_id     TYPE string
      RETURNING
        VALUE(rv_line) TYPE string.
    METHODS counts_voyages FOR TESTING.
* Chapter 2, exercise 3a: uncomment this method and its declaration, run the
* tests, and ABAP Unit reports a failed assertion.
*    METHODS broken_on_purpose FOR TESTING.
ENDCLASS.

CLASS ltcl_fleet IMPLEMENTATION.
  METHOD line_of.
    DATA lo_report TYPE REF TO zcl_osd_fleet_report.
    DATA lt_lines  TYPE string_table.
    DATA lv_line   TYPE string.
    DATA lv_prefix TYPE string.

    lv_prefix = iv_ship_id && ' *'.
    CREATE OBJECT lo_report.
    lt_lines = lo_report->ship_lines( ).
    LOOP AT lt_lines INTO lv_line.
      IF lv_line CP lv_prefix.
        rv_line = lv_line.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

* the seed (data/zosd_fleet_voy.tabu.json) gives S001 six voyages with 305
* passengers in all
  METHOD counts_voyages.
    cl_abap_unit_assert=>assert_equals(
      act = line_of( 'S001' )
      exp = 'S001 Albatross (Aloft): 6 voyages, 305 passengers' ).
  ENDMETHOD.

*  METHOD broken_on_purpose.
*    cl_abap_unit_assert=>assert_equals(
*      act = line_of( 'S006' )
*      exp = 'S006 Old Boiler (Maintenance): 1 voyages, 0 passengers' ).
*  ENDMETHOD.
ENDCLASS.
