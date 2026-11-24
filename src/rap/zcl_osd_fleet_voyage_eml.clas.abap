CLASS zcl_osd_fleet_voyage_eml DEFINITION PUBLIC FINAL CREATE PUBLIC.
* The voyage business object driven with EML (book chapter 21): the
* statements as they are written on a system, lowered by the transpiler
* onto KERNEL_RAP_EML and run by open-steamgate's managed RAP runtime
* (docs/rap-eml.md). Every method is one statement, so the chapter can
* quote them one by one: a draft voyage is created, its stops are added
* through the composition, it is activated and approved, and a voyage
* whose ship is not in the fleet is activated to see the validation stop
* the save.
  PUBLIC SECTION.
    TYPES tt_create   TYPE TABLE FOR CREATE zi_osd_fleet_voyage.
    TYPES tt_cba      TYPE TABLE FOR CREATE zi_osd_fleet_voyage\_Stops.
    TYPES tt_key      TYPE TABLE FOR READ IMPORT zi_osd_fleet_voyage.
    TYPES tt_voyage   TYPE TABLE FOR READ RESULT zi_osd_fleet_voyage.
    TYPES ty_voyage   TYPE STRUCTURE FOR READ RESULT zi_osd_fleet_voyage.
    TYPES tt_approve  TYPE TABLE FOR ACTION IMPORT zi_osd_fleet_voyage\Voyage~Approve.
    TYPES tt_approved TYPE TABLE FOR ACTION RESULT zi_osd_fleet_voyage\Voyage~Approve.
    TYPES tt_cancel   TYPE TABLE FOR ACTION IMPORT zi_osd_fleet_voyage\Voyage~Cancel.
    TYPES tt_canceled TYPE TABLE FOR ACTION RESULT zi_osd_fleet_voyage\Voyage~Cancel.
    TYPES tt_activate TYPE TABLE FOR ACTION IMPORT zi_osd_fleet_voyage\Voyage~Activate.
    TYPES ty_mapped   TYPE RESPONSE FOR MAPPED EARLY zi_osd_fleet_voyage.
    TYPES ty_failed   TYPE RESPONSE FOR FAILED EARLY zi_osd_fleet_voyage.
    TYPES ty_reported TYPE RESPONSE FOR REPORTED EARLY zi_osd_fleet_voyage.
    TYPES ty_uuid     TYPE zosd_fleet_voyage-voyage_uuid.

* MODIFY ... CREATE AUTO FILL CID FIELDS ( ship_id route ): a new draft,
* its key drawn by managed numbering
    METHODS create_draft
      IMPORTING
        iv_ship        TYPE csequence
        iv_route       TYPE csequence
      RETURNING
        VALUE(rv_uuid) TYPE ty_uuid.

* MODIFY ... CREATE BY \_Stops AUTO FILL CID: a port below the draft
    METHODS add_stop
      IMPORTING
        iv_uuid      TYPE ty_uuid
        iv_port      TYPE csequence
        iv_order     TYPE i
      RETURNING
        VALUE(rv_ok) TYPE abap_bool.

* MODIFY ... EXECUTE Activate: the draft becomes the active voyage
    METHODS activate
      IMPORTING
        iv_uuid     TYPE ty_uuid
      RETURNING
        VALUE(rv_ok) TYPE abap_bool.

* MODIFY ... EXECUTE approve FROM ... RESULT: the status the action set
    METHODS approve
      IMPORTING
        iv_uuid       TYPE ty_uuid
      RETURNING
        VALUE(rv_status) TYPE zosd_fleet_voyage-status.

* MODIFY ... EXECUTE cancel FROM ... RESULT: X
    METHODS cancel
      IMPORTING
        iv_uuid       TYPE ty_uuid
      RETURNING
        VALUE(rv_status) TYPE zosd_fleet_voyage-status.

* READ ... ALL FIELDS WITH ... RESULT: draft or active, by %is_draft
    METHODS read_voyage
      IMPORTING
        iv_uuid        TYPE ty_uuid
        iv_draft       TYPE abap_bool
      RETURNING
        VALUE(rs_voyage) TYPE ty_voyage.

* COMMIT ENTITIES RESPONSE OF ...: true when saved
    METHODS save
      EXPORTING
        es_failed       TYPE ty_failed
        es_reported     TYPE ty_reported
      RETURNING
        VALUE(rv_saved) TYPE abap_bool.

* ROLLBACK ENTITIES
    METHODS discard.

  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.



CLASS zcl_osd_fleet_voyage_eml IMPLEMENTATION.

  METHOD create_draft.
    DATA lt_create   TYPE tt_create.
    DATA ls_create   LIKE LINE OF lt_create.
    DATA ls_mapped   TYPE ty_mapped.
    DATA ls_failed   TYPE ty_failed.
    DATA ls_reported TYPE ty_reported.
    DATA ls_key      LIKE LINE OF ls_mapped-voyage.

    ls_create-%is_draft = if_abap_behv=>mk-on.
    ls_create-ship_id = iv_ship.
    ls_create-route = iv_route.
    APPEND ls_create TO lt_create.
    MODIFY ENTITIES OF zi_osd_fleet_voyage ENTITY Voyage
      CREATE AUTO FILL CID FIELDS ( ship_id route ) WITH lt_create
      MAPPED ls_mapped FAILED ls_failed REPORTED ls_reported.
    READ TABLE ls_mapped-voyage INDEX 1 INTO ls_key.
    IF sy-subrc = 0.
      rv_uuid = ls_key-voyage_uuid.
    ENDIF.
  ENDMETHOD.

  METHOD add_stop.
    DATA lt_cba    TYPE tt_cba.
    DATA ls_cba    LIKE LINE OF lt_cba.
    DATA ls_target LIKE LINE OF ls_cba-%target.
    DATA ls_mapped TYPE ty_mapped.
    DATA ls_failed TYPE ty_failed.
    DATA ls_reported TYPE ty_reported.

    ls_cba-voyage_uuid = iv_uuid.
    ls_cba-%is_draft = if_abap_behv=>mk-on.
    ls_target-%is_draft = if_abap_behv=>mk-on.
    ls_target-port_name = iv_port.
    ls_target-stop_order = iv_order.
    APPEND ls_target TO ls_cba-%target.
    APPEND ls_cba TO lt_cba.
* MODIFY ENTITIES OF zi_osd_fleet_voyage ENTITY Voyage
*   CREATE BY \_Stops AUTO FILL CID FIELDS ( port_name stop_order ) WITH lt_cba
*   MAPPED ls_mapped FAILED ls_failed REPORTED ls_reported.
* (the pinned transpiler does not lower CREATE BY \_assoc yet,
* docs/rap-eml.md, "Not lowered", so the statement stands as its call)
    zcl_osd_rap_eml=>create_by( EXPORTING iv_bdef = 'ZI_OSD_FLEET_VOYAGE'
                                          iv_entity = 'VOYAGE'
                                          iv_assoc = '_STOPS'
                                          it_rows = lt_cba
                                          iv_fields = 'PORT_NAME,STOP_ORDER'
                                          iv_auto_fill_cid = abap_true
                                CHANGING cs_mapped = ls_mapped
                                          cs_failed = ls_failed
                                          cs_reported = ls_reported ).
    IF ls_failed-voyage IS INITIAL.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.

  METHOD activate.
    DATA lt_activate TYPE tt_activate.
    DATA ls_activate LIKE LINE OF lt_activate.
    DATA ls_mapped   TYPE ty_mapped.
    DATA ls_failed   TYPE ty_failed.
    DATA ls_reported TYPE ty_reported.

    ls_activate-voyage_uuid = iv_uuid.
    ls_activate-%is_draft = if_abap_behv=>mk-on.
    APPEND ls_activate TO lt_activate.
    MODIFY ENTITIES OF zi_osd_fleet_voyage ENTITY Voyage
      EXECUTE Activate FROM lt_activate
      MAPPED ls_mapped FAILED ls_failed REPORTED ls_reported.
    IF ls_failed-voyage IS INITIAL.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.

  METHOD approve.
    DATA lt_approve  TYPE tt_approve.
    DATA ls_approve  LIKE LINE OF lt_approve.
    DATA lt_result   TYPE tt_approved.
    DATA ls_result   LIKE LINE OF lt_result.
    DATA ls_failed   TYPE ty_failed.
    DATA ls_reported TYPE ty_reported.

    ls_approve-voyage_uuid = iv_uuid.
    APPEND ls_approve TO lt_approve.
    MODIFY ENTITIES OF zi_osd_fleet_voyage ENTITY Voyage
      EXECUTE approve FROM lt_approve
      RESULT lt_result
      FAILED ls_failed REPORTED ls_reported.
    READ TABLE lt_result INDEX 1 INTO ls_result.
    IF sy-subrc = 0.
      rv_status = ls_result-%param-status.
    ENDIF.
  ENDMETHOD.

  METHOD cancel.
    DATA lt_cancel   TYPE tt_cancel.
    DATA ls_cancel   LIKE LINE OF lt_cancel.
    DATA lt_result   TYPE tt_canceled.
    DATA ls_result   LIKE LINE OF lt_result.
    DATA ls_failed   TYPE ty_failed.
    DATA ls_reported TYPE ty_reported.

    ls_cancel-voyage_uuid = iv_uuid.
    APPEND ls_cancel TO lt_cancel.
    MODIFY ENTITIES OF zi_osd_fleet_voyage ENTITY Voyage
      EXECUTE cancel FROM lt_cancel
      RESULT lt_result
      FAILED ls_failed REPORTED ls_reported.
    READ TABLE lt_result INDEX 1 INTO ls_result.
    IF sy-subrc = 0.
      rv_status = ls_result-%param-status.
    ENDIF.
  ENDMETHOD.

  METHOD read_voyage.
    DATA lt_key    TYPE tt_key.
    DATA ls_key    LIKE LINE OF lt_key.
    DATA lt_voyage TYPE tt_voyage.
    DATA ls_failed TYPE ty_failed.

    ls_key-voyage_uuid = iv_uuid.
    IF iv_draft = abap_true.
      ls_key-%is_draft = if_abap_behv=>mk-on.
    ENDIF.
    APPEND ls_key TO lt_key.
    READ ENTITIES OF zi_osd_fleet_voyage ENTITY Voyage
      ALL FIELDS WITH lt_key
      RESULT lt_voyage
      FAILED ls_failed.
    READ TABLE lt_voyage INDEX 1 INTO rs_voyage.
  ENDMETHOD.

  METHOD save.
    CLEAR: es_failed, es_reported.
    COMMIT ENTITIES RESPONSE OF zi_osd_fleet_voyage
      FAILED es_failed REPORTED es_reported.
    IF sy-subrc = 0.
      rv_saved = abap_true.
    ENDIF.
  ENDMETHOD.

  METHOD discard.
    ROLLBACK ENTITIES.
  ENDMETHOD.

ENDCLASS.
