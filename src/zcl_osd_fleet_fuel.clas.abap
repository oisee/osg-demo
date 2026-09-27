CLASS zcl_osd_fleet_fuel DEFINITION PUBLIC FINAL CREATE PUBLIC.
* Fuel per 100 km for each ship of the Airship fleet, as one AMDP method
* (README chapter 5). The body is SQLScript from the subset the
* open-steamgate engine runs portably on DuckDB; on HANA it is plain
* SQLScript. The classrun prints the result.
*
* A voyage without a distance would divide by zero, and HANA and DuckDB
* raise on that while SQLite returns NULL, so the body leaves such rows out
* before it divides. The quotient is rounded to two decimals in SQL: HANA
* returns a longer decimal, and how it is then narrowed into the result
* column (truncated or rounded) is not something to leave to the database.
  PUBLIC SECTION.
    INTERFACES if_amdp_marker_hdb.
    INTERFACES if_oo_adt_classrun.

    TYPES: BEGIN OF ty_fuel,
             ship_id        TYPE c LENGTH 4,
             fuel_kg        TYPE i,
             distance_km    TYPE i,
             fuel_per_100km TYPE p LENGTH 8 DECIMALS 2,
           END OF ty_fuel.
    TYPES tt_fuel TYPE STANDARD TABLE OF ty_fuel WITH DEFAULT KEY.

    CLASS-METHODS fuel_per_100km
      IMPORTING
        VALUE(iv_client) TYPE string
      EXPORTING
        VALUE(et_fuel)   TYPE tt_fuel.
ENDCLASS.



CLASS zcl_osd_fleet_fuel IMPLEMENTATION.

  METHOD fuel_per_100km BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT
                        OPTIONS READ-ONLY USING zosd_fleet_voy.
    et_fuel = SELECT ship_id,
                     CAST(SUM(fuel_kg) AS INTEGER) AS fuel_kg,
                     CAST(SUM(distance_km) AS INTEGER) AS distance_km,
                     ROUND( CAST(SUM(fuel_kg) AS INTEGER) * 100
                            / CAST(SUM(distance_km) AS INTEGER), 2 ) AS fuel_per_100km
                FROM zosd_fleet_voy
               WHERE mandt = CAST(:iv_client AS NVARCHAR(3))
                 AND distance_km > 0
               GROUP BY ship_id
               ORDER BY ship_id;
  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.
    DATA lt_fuel   TYPE tt_fuel.
    DATA ls_fuel   TYPE ty_fuel.
    DATA lv_client TYPE string.

* The engine runs AMDP on DuckDB (portable) and on HANA. On its default
* database, SQLite, the call has nowhere to go, so say so instead of dumping.
    IF sy-dbsys <> 'HDB' AND sy-dbsys <> 'duckdb'.
      out->write( |AMDP needs DuckDB or HANA; this system runs on { sy-dbsys }. Start it with STG_DB=duckdb.| ).
      RETURN.
    ENDIF.

    lv_client = sy-mandt.
    fuel_per_100km( EXPORTING iv_client = lv_client
                    IMPORTING et_fuel   = lt_fuel ).
    out->write( |Fuel per 100 km ({ sy-dbsys })| ).
    LOOP AT lt_fuel INTO ls_fuel.
      out->write( |{ ls_fuel-ship_id }: { ls_fuel-fuel_kg } kg over { ls_fuel-distance_km } km|
               && | = { ls_fuel-fuel_per_100km } kg/100 km| ).
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.
