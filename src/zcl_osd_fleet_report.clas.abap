CLASS zcl_osd_fleet_report DEFINITION PUBLIC FINAL CREATE PUBLIC.
* The fleet report (docs/fleet-contract.md, "ABAP"): one line per ship with
* its status, its voyage count and its passengers. Run it as a classrun
* (F9); a unit test reads the same lines through ship_lines( ).
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.

    METHODS ship_lines
      RETURNING
        VALUE(rt_lines) TYPE string_table.

* A ship cannot have less than no steam. The chapter's dump exercise sets a
* negative value and runs the report: this ASSERT stops it.
    METHODS steam_check
      IMPORTING
        iv_steam_pct TYPE i.
ENDCLASS.



CLASS zcl_osd_fleet_report IMPLEMENTATION.

  METHOD ship_lines.
    DATA lt_ship   TYPE STANDARD TABLE OF zosd_fleet_ship.
    DATA ls_ship   LIKE LINE OF lt_ship.
    DATA lt_voy    TYPE STANDARD TABLE OF zosd_fleet_voy.
    DATA ls_voy    LIKE LINE OF lt_voy.
    DATA lt_status TYPE STANDARD TABLE OF zosd_fleet_stat.
    DATA ls_status LIKE LINE OF lt_status.
    DATA lv_count  TYPE i.
    DATA lv_pax    TYPE i.
    DATA lv_line   TYPE string.

    SELECT * FROM zosd_fleet_ship INTO TABLE lt_ship ORDER BY ship_id.
    SELECT * FROM zosd_fleet_voy INTO TABLE lt_voy.
    SELECT * FROM zosd_fleet_stat INTO TABLE lt_status.

    LOOP AT lt_ship INTO ls_ship.
      steam_check( ls_ship-steam_pct ).
      CLEAR: lv_count, lv_pax, ls_status.
      LOOP AT lt_voy INTO ls_voy WHERE ship_id = ls_ship-ship_id.
        lv_count = lv_count + 1.
        lv_pax = lv_pax + ls_voy-passengers.
      ENDLOOP.
      READ TABLE lt_status INTO ls_status WITH KEY status = ls_ship-status.
      lv_line = |{ ls_ship-ship_id } { ls_ship-name } ({ ls_status-text }): |
             && |{ lv_count } voyages, { lv_pax } passengers|.
      APPEND lv_line TO rt_lines.
    ENDLOOP.
  ENDMETHOD.

  METHOD steam_check.
    ASSERT iv_steam_pct >= 0.
  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.
    DATA lt_lines TYPE string_table.
    DATA lv_line  TYPE string.

    out->write( 'Airship fleet' ).
    lt_lines = ship_lines( ).
    LOOP AT lt_lines INTO lv_line.
      out->write( lv_line ).
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.
