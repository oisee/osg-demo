CLASS zcl_osd_fleet_summary DEFINITION PUBLIC FINAL CREATE PUBLIC.
* Chapter 6: one row per ship, including a ship with no voyages. The AMDP
* does the grouping; the classrun independently counts the seeded rows with
* Open SQL so a portable result cannot silently disagree with ABAP.
  PUBLIC SECTION.
    INTERFACES if_amdp_marker_hdb.
    INTERFACES if_oo_adt_classrun.

    TYPES: BEGIN OF ty_summary,
             ship_id         TYPE c LENGTH 4,
             status          TYPE c LENGTH 1,
             voyage_count    TYPE i,
             passenger_count TYPE i,
             distance_km     TYPE i,
           END OF ty_summary.
    TYPES tt_summary TYPE STANDARD TABLE OF ty_summary WITH DEFAULT KEY.

    CLASS-METHODS ship_summary
      IMPORTING VALUE(iv_client) TYPE string
      EXPORTING VALUE(et_summary) TYPE tt_summary.
ENDCLASS.


CLASS zcl_osd_fleet_summary IMPLEMENTATION.
  METHOD ship_summary BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT
                      OPTIONS READ-ONLY USING zosd_fleet_ship zosd_fleet_voy.
* Voyage fields are unique in this join. The portable lowerer currently loses
* a source alias inside an aggregate over a joined relation (OSD #199).
    et_summary = SELECT s.ship_id,
                        s.status,
                        CAST(COUNT(voyage_id) AS INTEGER) AS voyage_count,
                        CAST(SUM(CASE WHEN voyage_id IS NULL THEN 0 ELSE passengers END) AS INTEGER) AS passenger_count,
                        CAST(SUM(CASE WHEN voyage_id IS NULL THEN 0 ELSE distance_km END) AS INTEGER) AS distance_km
                   FROM zosd_fleet_ship AS s
                   LEFT OUTER JOIN zosd_fleet_voy AS v
                     ON v.mandt = s.mandt AND v.ship_id = s.ship_id
                  WHERE s.mandt = CAST(:iv_client AS NVARCHAR(3))
                  GROUP BY s.ship_id, s.status;
  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.
    DATA lt_summary TYPE tt_summary.
    DATA ls_summary TYPE ty_summary.
    DATA lt_ship TYPE STANDARD TABLE OF zosd_fleet_ship.
    DATA ls_ship LIKE LINE OF lt_ship.
    DATA lt_voy TYPE STANDARD TABLE OF zosd_fleet_voy.
    DATA ls_voy LIKE LINE OF lt_voy.
    DATA lv_count TYPE i.
    DATA lv_pax TYPE i.
    DATA lv_km TYPE i.
    DATA lv_matches TYPE i.
    DATA lv_client TYPE string.
    DATA lx_root TYPE REF TO cx_root.

    IF sy-dbsys <> 'HDB' AND sy-dbsys <> 'duckdb'.
      out->write( |AMDP needs DuckDB or HANA; this system runs on { sy-dbsys }. Start it with STG_DB=duckdb.| ).
      RETURN.
    ENDIF.

    lv_client = sy-mandt.
    TRY.
        ship_summary( EXPORTING iv_client = lv_client
                      IMPORTING et_summary = lt_summary ).
      CATCH cx_root INTO lx_root.
        out->write( |AMDP summary failed: { lx_root->get_text( ) }| ).
        RETURN.
    ENDTRY.
    SELECT * FROM zosd_fleet_ship INTO TABLE lt_ship ORDER BY ship_id.
    SELECT * FROM zosd_fleet_voy INTO TABLE lt_voy.

    out->write( |Fleet summary ({ sy-dbsys }); checked against Open SQL| ).
    LOOP AT lt_ship INTO ls_ship.
      CLEAR: lv_count, lv_pax, lv_km, ls_summary.
      LOOP AT lt_voy INTO ls_voy WHERE ship_id = ls_ship-ship_id.
        lv_count = lv_count + 1.
        lv_pax = lv_pax + ls_voy-passengers.
        lv_km = lv_km + ls_voy-distance_km.
      ENDLOOP.
      READ TABLE lt_summary INTO ls_summary WITH KEY ship_id = ls_ship-ship_id.
      IF sy-subrc <> 0 OR ls_summary-status <> ls_ship-status
         OR ls_summary-voyage_count <> lv_count
         OR ls_summary-passenger_count <> lv_pax
         OR ls_summary-distance_km <> lv_km.
        out->write( |MISMATCH { ls_ship-ship_id }: AMDP and Open SQL disagree| ).
        RETURN.
      ENDIF.
      lv_matches = lv_matches + 1.
      out->write( |{ ls_ship-ship_id } { ls_ship-status }: { lv_count } voyages, { lv_pax } passengers, { lv_km } km| ).
    ENDLOOP.
    IF lines( lt_summary ) <> lv_matches.
      out->write( |MISMATCH: AMDP returned { lines( lt_summary ) } rows; Open SQL found { lv_matches } ships| ).
      RETURN.
    ENDIF.
    out->write( |MATCH: { lv_matches } ships| ).
  ENDMETHOD.
ENDCLASS.
