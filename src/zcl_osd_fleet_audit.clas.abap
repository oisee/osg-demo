CLASS zcl_osd_fleet_audit DEFINITION PUBLIC FINAL CREATE PUBLIC.
* The read-only business result that a future BAL adapter can persist.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.

    TYPES: BEGIN OF ty_result,
             ship_count   TYPE i,
             voyage_count TYPE i,
             severity     TYPE c LENGTH 1,
             message      TYPE string,
           END OF ty_result.

    CLASS-METHODS inspect
      IMPORTING
        iv_expected_ships   TYPE i DEFAULT 6
        iv_expected_voyages TYPE i DEFAULT 20
      RETURNING
        VALUE(rs_result) TYPE ty_result.
ENDCLASS.



CLASS zcl_osd_fleet_audit IMPLEMENTATION.

  METHOD inspect.
    SELECT COUNT( * ) FROM zosd_fleet_ship INTO rs_result-ship_count.
    SELECT COUNT( * ) FROM zosd_fleet_voy INTO rs_result-voyage_count.

    IF rs_result-ship_count = iv_expected_ships
       AND rs_result-voyage_count = iv_expected_voyages.
      rs_result-severity = 'S'.
      rs_result-message = |Fleet audit OK: { rs_result-ship_count } ships, |
                       && |{ rs_result-voyage_count } voyages|.
    ELSE.
      rs_result-severity = 'E'.
      rs_result-message = |Fleet audit failed: { rs_result-ship_count } ships, |
                       && |{ rs_result-voyage_count } voyages; expected |
                       && |{ iv_expected_ships } and { iv_expected_voyages }|.
    ENDIF.
  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.
    DATA ls_result TYPE ty_result.

    ls_result = inspect( ).
    out->write( ls_result-message ).
  ENDMETHOD.
ENDCLASS.
