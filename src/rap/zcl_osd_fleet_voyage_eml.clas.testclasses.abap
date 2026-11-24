* The voyage business object driven with EML, as the book's chapter 21
* tells it: a draft with two ports is created, its status and its steam
* come from the determinations, Activate saves it and Approve sets A; a
* voyage whose ship is not in the fleet stops at the validation and
* nothing is written; a cancelled voyage is not approved again. The seed
* of chapter 1 supplies the fleet's ships, so only what a test created is
* deleted again.
CLASS ltcl_voyage DEFINITION FOR TESTING DURATION SHORT RISK LEVEL DANGEROUS FINAL.
  PRIVATE SECTION.
    DATA mo_voyages TYPE REF TO zcl_osd_fleet_voyage_eml.
    DATA mt_uuid    TYPE STANDARD TABLE OF zosd_fleet_voyage-voyage_uuid WITH DEFAULT KEY.

    METHODS setup.
    METHODS teardown.
* rows of the four tables of this uuid, and its draft admin row
    METHODS db_count
      IMPORTING
        iv_table        TYPE csequence
        iv_uuid         TYPE zosd_fleet_voyage-voyage_uuid
      RETURNING
        VALUE(rv_count) TYPE i.
    METHODS draft_stops_activate_approve FOR TESTING RAISING cx_static_check.
    METHODS unknown_ship_writes_nothing FOR TESTING RAISING cx_static_check.
    METHODS cancelled_is_not_approved FOR TESTING RAISING cx_static_check.
ENDCLASS.

CLASS ltcl_voyage IMPLEMENTATION.

  METHOD setup.
    zcl_osd_rap_eml=>reset( ).
    CREATE OBJECT mo_voyages.
  ENDMETHOD.

  METHOD teardown.
    DATA lv_uuid TYPE zosd_fleet_voyage-voyage_uuid.
    DATA lv_admin TYPE zosd_draft_adm-draftuuid.
    zcl_osd_rap_eml=>rollback( ).
    zcl_osd_rap_eml=>reset( ).
    LOOP AT mt_uuid INTO lv_uuid.
      SELECT SINGLE draftadministrativedatauuid FROM zosd_fleet_voyage_d
             INTO lv_admin WHERE voyage_uuid = @lv_uuid.
      IF sy-subrc = 0 AND lv_admin IS NOT INITIAL.
        DELETE FROM zosd_draft_adm WHERE draftuuid = @lv_admin.
      ENDIF.
      DELETE FROM zosd_fleet_voyage   WHERE voyage_uuid = @lv_uuid.
      DELETE FROM zosd_fleet_voyage_d WHERE voyage_uuid = @lv_uuid.
      DELETE FROM zosd_fleet_stop     WHERE voyage_uuid = @lv_uuid.
      DELETE FROM zosd_fleet_stop_d   WHERE voyage_uuid = @lv_uuid.
    ENDLOOP.
    COMMIT WORK.
  ENDMETHOD.

  METHOD db_count.
    DATA lv_count TYPE i.
    CASE iv_table.
      WHEN 'vosd_fleet_voyage'.
        SELECT COUNT(*) FROM zosd_fleet_voyage INTO lv_count WHERE voyage_uuid = @iv_uuid.
      WHEN 'vosd_fleet_voyage_d'.
        SELECT COUNT(*) FROM zosd_fleet_voyage_d INTO lv_count WHERE voyage_uuid = @iv_uuid.
      WHEN 'vosd_fleet_stop'.
        SELECT COUNT(*) FROM zosd_fleet_stop INTO lv_count WHERE voyage_uuid = @iv_uuid.
      WHEN 'vosd_fleet_stop_d'.
        SELECT COUNT(*) FROM zosd_fleet_stop_d INTO lv_count WHERE voyage_uuid = @iv_uuid.
    ENDCASE.
    rv_count = lv_count.
  ENDMETHOD.

  METHOD draft_stops_activate_approve.
    DATA lv_uuid   TYPE zosd_fleet_voyage-voyage_uuid.
    DATA ls_voyage TYPE zcl_osd_fleet_voyage_eml=>ty_voyage.

* a draft for a ship of the fleet, with two ports it calls at
    lv_uuid = mo_voyages->create_draft( iv_ship = 'S001' iv_route = 'Port Aurel - Cloudhaven' ).
    cl_abap_unit_assert=>assert_not_initial( act = lv_uuid msg = 'the create maps a key' ).
    cl_abap_unit_assert=>assert_true( act = mo_voyages->add_stop( iv_uuid = lv_uuid iv_port = 'Port Aurel' iv_order = 1 )
                                       msg = 'a stop is created by the composition' ).
    cl_abap_unit_assert=>assert_true( act = mo_voyages->add_stop( iv_uuid = lv_uuid iv_port = 'Cloudhaven' iv_order = 2 ) ).

* the draft carries the determinations' fields, and nothing is written yet
    ls_voyage = mo_voyages->read_voyage( iv_uuid = lv_uuid iv_draft = abap_true ).
    cl_abap_unit_assert=>assert_equals( act = ls_voyage-status exp = 'P' msg = 'SetPlanned ran' ).
    cl_abap_unit_assert=>assert_equals( act = ls_voyage-steam_needed exp = 35
                      msg = '15 to raise the ship, 10 per port: two ports' ).
    cl_abap_unit_assert=>assert_equals( act = db_count( iv_table = 'vosd_fleet_voyage_d' iv_uuid = lv_uuid ) exp = 0
                      msg = 'a draft stays in the buffer until COMMIT ENTITIES' ).

* Activate, then COMMIT ENTITIES: the active voyage, its stops with it
    cl_abap_unit_assert=>assert_true( act = mo_voyages->activate( lv_uuid ) msg = 'Activate ran' ).
    cl_abap_unit_assert=>assert_true( act = mo_voyages->save( ) msg = 'COMMIT ENTITIES saved' ).
    APPEND lv_uuid TO mt_uuid.
    ls_voyage = mo_voyages->read_voyage( iv_uuid = lv_uuid iv_draft = abap_false ).
    cl_abap_unit_assert=>assert_equals( act = ls_voyage-ship_id exp = 'S001' ).
    cl_abap_unit_assert=>assert_equals( act = ls_voyage-steam_needed exp = 35 msg = 'the steam went with it' ).
    cl_abap_unit_assert=>assert_equals( act = db_count( iv_table = 'vosd_fleet_stop' iv_uuid = lv_uuid ) exp = 2 ).
    cl_abap_unit_assert=>assert_equals( act = db_count( iv_table = 'vosd_fleet_voyage_d' iv_uuid = lv_uuid ) exp = 0
                      msg = 'the draft is gone' ).

* Approve answers the voyage itself, with the status it set
    cl_abap_unit_assert=>assert_equals( act = mo_voyages->approve( lv_uuid ) exp = 'A' msg = 'EXECUTE answers the RESULT' ).
    cl_abap_unit_assert=>assert_true( act = mo_voyages->save( ) ).
    ls_voyage = mo_voyages->read_voyage( iv_uuid = lv_uuid iv_draft = abap_false ).
    cl_abap_unit_assert=>assert_equals( act = ls_voyage-status exp = 'A' ).
  ENDMETHOD.

  METHOD unknown_ship_writes_nothing.
    DATA lv_uuid    TYPE zosd_fleet_voyage-voyage_uuid.
    DATA ls_failed   TYPE zcl_osd_fleet_voyage_eml=>ty_failed.
    DATA ls_reported TYPE zcl_osd_fleet_voyage_eml=>ty_reported.

* a draft whose ship the fleet does not have, with a port
    lv_uuid = mo_voyages->create_draft( iv_ship = 'S999' iv_route = 'Nowhere - Anywhere' ).
    cl_abap_unit_assert=>assert_true( act = mo_voyages->add_stop( iv_uuid = lv_uuid iv_port = 'Nowhere' iv_order = 1 ) ).

* the draft may hold it; Activate writes the active instances, and the
* save sequence runs the validation: the COMMIT ENTITIES fails, nothing
* is written anywhere
    cl_abap_unit_assert=>assert_true( act = mo_voyages->activate( lv_uuid ) msg = 'Activate runs on the draft' ).
    cl_abap_unit_assert=>assert_false( act = mo_voyages->save( IMPORTING es_failed = ls_failed es_reported = ls_reported )
                                       msg = 'the validation stops the COMMIT ENTITIES' ).
    cl_abap_unit_assert=>assert_equals( act = lines( ls_failed-voyage ) exp = 1 msg = 'RESPONSE OF carries the FAILED' ).
    cl_abap_unit_assert=>assert_equals( act = lines( ls_reported-voyage ) exp = 1 msg = 'and the message' ).
    cl_abap_unit_assert=>assert_equals( act = db_count( iv_table = 'vosd_fleet_voyage' iv_uuid = lv_uuid ) exp = 0
                      msg = 'no active voyage is written' ).
    cl_abap_unit_assert=>assert_equals( act = db_count( iv_table = 'vosd_fleet_voyage_d' iv_uuid = lv_uuid ) exp = 0
                      msg = 'no draft either: nothing was ever saved' ).
    cl_abap_unit_assert=>assert_equals( act = db_count( iv_table = 'vosd_fleet_stop' iv_uuid = lv_uuid ) exp = 0 ).

* and ROLLBACK ENTITIES forgets it
    mo_voyages->discard( ).
    cl_abap_unit_assert=>assert_true( act = mo_voyages->save( ) msg = 'after ROLLBACK there is nothing to fail' ).
    cl_abap_unit_assert=>assert_equals( act = db_count( iv_table = 'vosd_fleet_voyage' iv_uuid = lv_uuid ) exp = 0 ).
  ENDMETHOD.

  METHOD cancelled_is_not_approved.
    DATA lv_uuid  TYPE zosd_fleet_voyage-voyage_uuid.
    DATA ls_voyage TYPE zcl_osd_fleet_voyage_eml=>ty_voyage.

    lv_uuid = mo_voyages->create_draft( iv_ship = 'S003' iv_route = 'Cloudhaven - Tinmere' ).
    cl_abap_unit_assert=>assert_true( act = mo_voyages->activate( lv_uuid ) ).
    cl_abap_unit_assert=>assert_true( act = mo_voyages->save( ) ).
    APPEND lv_uuid TO mt_uuid.
    ls_voyage = mo_voyages->read_voyage( iv_uuid = lv_uuid iv_draft = abap_false ).
    cl_abap_unit_assert=>assert_equals( act = ls_voyage-status exp = 'P' msg = 'planned' ).

* Cancel sets X; Approve of a cancelled voyage is refused and answers
* nothing, and a save changes nothing
    cl_abap_unit_assert=>assert_equals( act = mo_voyages->cancel( lv_uuid ) exp = 'X' msg = 'cancel' ).
    cl_abap_unit_assert=>assert_true( act = mo_voyages->save( ) ).
    cl_abap_unit_assert=>assert_initial( act = mo_voyages->approve( lv_uuid )
                      msg = 'Approve of a cancelled voyage is refused' ).
    cl_abap_unit_assert=>assert_true( act = mo_voyages->save( ) ).
    ls_voyage = mo_voyages->read_voyage( iv_uuid = lv_uuid iv_draft = abap_false ).
    cl_abap_unit_assert=>assert_equals( act = ls_voyage-status exp = 'X' msg = 'still cancelled' ).
  ENDMETHOD.

ENDCLASS.
