CLASS zcl_osd_fleet_iti DEFINITION PUBLIC FINAL CREATE PUBLIC.
* Chapter 18: C in ABAP. ZCL_WASM_MANDEL is iti/mandel.c, compiled by
* clang to WebAssembly and by abapiti to ABAP; this classrun asks it for the
* iterations at every point of a 64 x 24 grid and draws them as characters.
* The same grid from the same C, compiled natively, is what test/iti.mjs
* compares this output with.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    CONSTANTS c_cols TYPE i VALUE 64.
    CONSTANTS c_rows TYPE i VALUE 24.
    CONSTANTS c_max TYPE i VALUE 32.
    CONSTANTS c_ramp TYPE string VALUE ' .:-=+*#%@'.
ENDCLASS.

CLASS zcl_osd_fleet_iti IMPLEMENTATION.

  METHOD if_oo_adt_classrun~main.
    DATA lo_c TYPE REF TO zcl_wasm_mandel.
    DATA lv_row TYPE i.
    DATA lv_col TYPE i.
    DATA lv_cx TYPE i.
    DATA lv_cy TYPE i.
    DATA lv_n TYPE i.
    DATA lv_at TYPE i.
    DATA lv_line TYPE string.
    DATA lv_sum TYPE i.
    CREATE OBJECT lo_c.
    " the plane from -2.0 to 0.5 across and -1.25 to 1.25 down, in 16.16 fixed point
    DO c_rows TIMES.
      lv_row = sy-index - 1.
      lv_cy = -81920 + lv_row * 163840 DIV ( c_rows - 1 ).
      CLEAR lv_line.
      DO c_cols TIMES.
        lv_col = sy-index - 1.
        lv_cx = -131072 + lv_col * 163840 DIV ( c_cols - 1 ).
        lv_n = lo_c->mandel( p0 = lv_cx p1 = lv_cy p2 = c_max ).
        lv_sum = ( lv_sum + lv_n ) MOD 1000000.
        IF lv_n >= c_max.
          lv_at = 9.
        ELSE.
          lv_at = lv_n * 9 DIV c_max.
        ENDIF.
        lv_line = lv_line && substring( val = c_ramp off = lv_at len = 1 ).
      ENDDO.
      out->write( |{ lv_line }| ).
    ENDDO.
    out->write( |Iterations: { lv_sum }| ).
  ENDMETHOD.

ENDCLASS.
