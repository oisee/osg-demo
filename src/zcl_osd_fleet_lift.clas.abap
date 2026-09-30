CLASS zcl_osd_fleet_lift DEFINITION PUBLIC FINAL CREATE PUBLIC.
* A legacy fleet routine and its lifted form (recipe R1 of open-steamgate's
* verified lift). BEFORE reads each voyage's ship name with one SELECT SINGLE
* per row; AFTER reads all the names with one SELECT ... FOR ALL ENTRIES into
* a hashed table. The region between the lift markers in AFTER is generated:
* tools/lift.mjs reads the model out of BEFORE, and ZCL_OSD_TPL renders
* recipes/r1-lookup-enrich/template.tpl from it (book chapter 11, "Lift a legacy
* routine"). The test class runs both on the same rows and compares them.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    TYPES: BEGIN OF ty_voyage,
             voyage_id TYPE zosd_fleet_voy-voyage_id,
             ship_id   TYPE zosd_fleet_ship-ship_id,
             ship_name TYPE zosd_fleet_ship-name,
           END OF ty_voyage,
           tt_voyages TYPE STANDARD TABLE OF ty_voyage WITH DEFAULT KEY.
    CLASS-METHODS voyages
      RETURNING VALUE(rt_voyages) TYPE tt_voyages.
    CLASS-METHODS before
      CHANGING ct_voyages TYPE tt_voyages.
    CLASS-METHODS after
      CHANGING ct_voyages TYPE tt_voyages.
ENDCLASS.

CLASS zcl_osd_fleet_lift IMPLEMENTATION.
  METHOD voyages.
    SELECT voyage_id ship_id FROM zosd_fleet_voy
      INTO CORRESPONDING FIELDS OF TABLE rt_voyages
      ORDER BY voyage_id.
  ENDMETHOD.

  METHOD before.
    FIELD-SYMBOLS <ls_voyage> LIKE LINE OF ct_voyages.
    LOOP AT ct_voyages ASSIGNING <ls_voyage>.
      SELECT SINGLE name FROM zosd_fleet_ship INTO <ls_voyage>-ship_name
        WHERE ship_id = <ls_voyage>-ship_id.
    ENDLOOP.
  ENDMETHOD.

  METHOD after.
    FIELD-SYMBOLS <ls_voyage> LIKE LINE OF ct_voyages.
    " lift:R1 begin
    DATA lt_lookup TYPE HASHED TABLE OF zosd_fleet_ship WITH UNIQUE KEY ship_id.
    FIELD-SYMBOLS <ls_lookup> LIKE LINE OF lt_lookup.
    IF ct_voyages IS NOT INITIAL.
      SELECT ship_id name FROM zosd_fleet_ship
        INTO CORRESPONDING FIELDS OF TABLE lt_lookup
        FOR ALL ENTRIES IN ct_voyages
        WHERE ship_id = ct_voyages-ship_id.
    ENDIF.
    LOOP AT ct_voyages ASSIGNING <ls_voyage>.
      READ TABLE lt_lookup ASSIGNING <ls_lookup> WITH TABLE KEY ship_id = <ls_voyage>-ship_id.
      IF sy-subrc = 0.
        <ls_voyage>-ship_name = <ls_lookup>-name.
      ENDIF.
    ENDLOOP.
    " lift:R1 end
  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.
    DATA(lt_before) = voyages( ).
    DATA(lt_after) = lt_before.
    before( CHANGING ct_voyages = lt_before ).
    after( CHANGING ct_voyages = lt_after ).
    IF lt_before = lt_after.
      out->write( |BEFORE and AFTER agree on { lines( lt_after ) } voyages.| ).
    ELSE.
      out->write( |BEFORE and AFTER differ on { lines( lt_after ) } voyages.| ).
    ENDIF.
    LOOP AT lt_after INTO DATA(ls_voyage) TO 3.
      out->write( |{ ls_voyage-voyage_id } { ls_voyage-ship_id } { ls_voyage-ship_name }| ).
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.
