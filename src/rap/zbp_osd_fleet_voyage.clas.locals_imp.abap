* The fleet's RAP behavior pool (book chapter 21): the voyages of the
* airship fleet as a managed, draft-enabled business object. The handler
* declarations are the ones a system accepts (FOR DETERMINE ON MODIFY
* IMPORTING keys FOR Voyage~SetPlanned; tools/rap/lower-derived.mjs lowers
* them), and each handler reads and changes the instances through EML in
* local mode, the way a system's handler does -- not through a table of
* instances handed in.
*
* The fleet's rules, in the words of the book:
* - a new voyage starts as P (planned); Approve sets A, Cancel sets X, and
*   a cancelled voyage cannot be approved;
* - the ship must be one of the fleet's (ZOSD_FLEET_SHIP, the seed of
*   chapter 1): the validation runs on save and on Prepare;
* - a voyage needs 15 units of steam to raise the ship and 10 more for
*   every port it calls at: 15 with no port yet, 35 for two ports. The
*   fleet has no steam logic of its own to reuse (ZCL_OSD_FLEET_FUEL
*   computes fuel per 100 km over the classic voyage table), so the rule is
*   the book's own and it lives in one place, the internal action
*   RecalcSteam: a determination of the voyage runs it when the voyage is
*   created or its route changes, a determination of the stop runs it for
*   the voyage above whenever a stop is created or changed.
*
* One statement is written as the call it lowers to, with the statement in
* a comment above it: READ ENTITIES ... BY \_Stops, which the pinned
* transpiler does not lower yet (docs/rap-eml.md, "Not lowered").
CLASS lhc_voyage DEFINITION INHERITING FROM cl_abap_behavior_handler FINAL.
  PRIVATE SECTION.
    METHODS set_planned FOR DETERMINE ON MODIFY
      IMPORTING keys FOR Voyage~SetPlanned.
    METHODS calc_steam FOR DETERMINE ON MODIFY
      IMPORTING keys FOR Voyage~CalcSteam.
    METHODS recalc_steam FOR MODIFY
      IMPORTING keys FOR ACTION Voyage~RecalcSteam.
    METHODS check_ship FOR VALIDATE ON SAVE
      IMPORTING keys FOR Voyage~CheckShip.
    METHODS approve FOR MODIFY
      IMPORTING keys FOR ACTION Voyage~Approve RESULT result.
    METHODS cancel FOR MODIFY
      IMPORTING keys FOR ACTION Voyage~Cancel RESULT result.
ENDCLASS.

CLASS lhc_voyage IMPLEMENTATION.

  METHOD set_planned.
* a new voyage starts as P (planned)
    DATA lt_read    TYPE TABLE FOR READ IMPORT zi_osd_fleet_voyage.
    DATA ls_read    LIKE LINE OF lt_read.
    DATA lt_voyages TYPE TABLE FOR READ RESULT zi_osd_fleet_voyage.
    DATA ls_voyage  LIKE LINE OF lt_voyages.
    DATA lt_update  TYPE TABLE FOR UPDATE zi_osd_fleet_voyage.
    DATA ls_update  LIKE LINE OF lt_update.
    DATA ls_key     LIKE LINE OF keys.

    LOOP AT keys INTO ls_key.
      CLEAR ls_read.
      ls_read-%tky = ls_key-%tky.
      APPEND ls_read TO lt_read.
    ENDLOOP.
    READ ENTITIES OF zi_osd_fleet_voyage IN LOCAL MODE
      ENTITY Voyage
        FIELDS ( status ) WITH lt_read
      RESULT lt_voyages.
    LOOP AT lt_voyages INTO ls_voyage WHERE status IS INITIAL.
      CLEAR ls_update.
      ls_update-%tky = ls_voyage-%tky.
      ls_update-status = 'P'.
      APPEND ls_update TO lt_update.
    ENDLOOP.
    IF lt_update IS INITIAL.
      RETURN.
    ENDIF.
    MODIFY ENTITIES OF zi_osd_fleet_voyage IN LOCAL MODE
      ENTITY Voyage
        UPDATE FIELDS ( status ) WITH lt_update
      REPORTED reported.
  ENDMETHOD.

  METHOD calc_steam.
* the voyage was created, or its route changed: the internal action does
* the arithmetic, IN LOCAL MODE, as the only code that may write the
* read-only field
    DATA lt_exec TYPE TABLE FOR ACTION IMPORT zi_osd_fleet_voyage~RecalcSteam.
    DATA ls_exec LIKE LINE OF lt_exec.
    DATA ls_key  LIKE LINE OF keys.

    LOOP AT keys INTO ls_key.
      CLEAR ls_exec.
      ls_exec-%tky = ls_key-%tky.
      APPEND ls_exec TO lt_exec.
    ENDLOOP.
    MODIFY ENTITIES OF zi_osd_fleet_voyage IN LOCAL MODE
      ENTITY Voyage
        EXECUTE RecalcSteam FROM lt_exec
      REPORTED reported.
  ENDMETHOD.

  METHOD recalc_steam.
* steam needed: 15 to raise the ship, 10 per port the voyage calls at.
* The stops are read through the composition, so the rule counts the ports
* of the draft while it is a draft and of the active voyage once saved
    DATA lt_read  TYPE TABLE FOR READ IMPORT zi_osd_fleet_voyage\_Stops.
    DATA ls_read  LIKE LINE OF lt_read.
    DATA lt_stops TYPE TABLE FOR READ RESULT zi_osd_fleet_voyage\_Stops.
    DATA ls_stop  LIKE LINE OF lt_stops.
    DATA lt_link  TYPE TABLE FOR READ LINK zi_osd_fleet_voyage\_Stops.
    DATA ls_link  LIKE LINE OF lt_link.
    DATA lt_update TYPE TABLE FOR UPDATE zi_osd_fleet_voyage.
    DATA ls_update LIKE LINE OF lt_update.
    DATA ls_failed TYPE RESPONSE FOR FAILED EARLY zi_osd_fleet_voyage.
    DATA ls_key    LIKE LINE OF keys.

    LOOP AT keys INTO ls_key.
      CLEAR ls_read.
      ls_read-%tky = ls_key-%tky.
      APPEND ls_read TO lt_read.
    ENDLOOP.
* READ ENTITIES OF zi_osd_fleet_voyage IN LOCAL MODE
*   ENTITY Voyage BY \_Stops FROM lt_read
*   RESULT lt_stops LINK lt_link.
    zcl_osd_rap_eml=>read_by( EXPORTING iv_bdef   = 'ZI_OSD_FLEET_VOYAGE'
                                        iv_entity = 'VOYAGE'
                                        iv_assoc  = '_STOPS'
                                        it_keys   = lt_read
                              CHANGING  ct_result = lt_stops
                                        ct_link   = lt_link
                                        cs_failed = ls_failed ).
    LOOP AT lt_read INTO ls_read.
      CLEAR ls_update.
      ls_update-%tky = ls_read-%tky.
      LOOP AT lt_link INTO ls_link.
        IF ls_link-source-voyage_uuid <> ls_read-voyage_uuid
            OR ls_link-source-%is_draft <> ls_read-%is_draft.
          CONTINUE.
        ENDIF.
        LOOP AT lt_stops INTO ls_stop WHERE stop_uuid = ls_link-target-stop_uuid.
          ls_update-steam_needed = ls_update-steam_needed + 10.
        ENDLOOP.
      ENDLOOP.
      ls_update-steam_needed = ls_update-steam_needed + 15.
      APPEND ls_update TO lt_update.
    ENDLOOP.
    IF lt_update IS INITIAL.
      RETURN.
    ENDIF.
    MODIFY ENTITIES OF zi_osd_fleet_voyage IN LOCAL MODE
      ENTITY Voyage
        UPDATE FIELDS ( steam_needed ) WITH lt_update
      REPORTED reported.
  ENDMETHOD.

  METHOD check_ship.
* the ship must be one of the fleet's
    DATA lt_read     TYPE TABLE FOR READ IMPORT zi_osd_fleet_voyage.
    DATA ls_read     LIKE LINE OF lt_read.
    DATA lt_voyages  TYPE TABLE FOR READ RESULT zi_osd_fleet_voyage.
    DATA ls_voyage   LIKE LINE OF lt_voyages.
    DATA ls_failed   LIKE LINE OF failed-voyage.
    DATA ls_reported LIKE LINE OF reported-voyage.
    DATA lv_ship     TYPE zosd_fleet_ship-ship_id.
    DATA ls_key      LIKE LINE OF keys.

    LOOP AT keys INTO ls_key.
      CLEAR ls_read.
      ls_read-%tky = ls_key-%tky.
      APPEND ls_read TO lt_read.
    ENDLOOP.
    READ ENTITIES OF zi_osd_fleet_voyage IN LOCAL MODE
      ENTITY Voyage
        FIELDS ( ship_id ) WITH lt_read
      RESULT lt_voyages
      FAILED failed.
    LOOP AT lt_voyages INTO ls_voyage.
      IF ls_voyage-ship_id IS INITIAL.
        CLEAR: ls_failed, ls_reported.
        ls_failed-%tky = ls_voyage-%tky.
        APPEND ls_failed TO failed-voyage.
        ls_reported-%tky = ls_voyage-%tky.
        ls_reported-%msg = new_message_with_text(
          severity = if_abap_behv_message=>severity-error
          text     = 'A voyage needs one of the fleet''s ships' ).
        ls_reported-%element-ship_id = if_abap_behv=>mk-on.
        APPEND ls_reported TO reported-voyage.
        CONTINUE.
      ENDIF.
      SELECT SINGLE ship_id FROM zosd_fleet_ship INTO lv_ship
             WHERE ship_id = @ls_voyage-ship_id.
      IF sy-subrc <> 0.
        CLEAR: ls_failed, ls_reported.
        ls_failed-%tky = ls_voyage-%tky.
        APPEND ls_failed TO failed-voyage.
        ls_reported-%tky = ls_voyage-%tky.
        ls_reported-%msg = new_message_with_text(
          severity = if_abap_behv_message=>severity-error
          text     = |Ship { ls_voyage-ship_id } is not in the fleet| ).
        ls_reported-%element-ship_id = if_abap_behv=>mk-on.
        APPEND ls_reported TO reported-voyage.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD approve.
* an approved voyage is A; a cancelled one stays X
    DATA lt_read     TYPE TABLE FOR READ IMPORT zi_osd_fleet_voyage.
    DATA ls_read     LIKE LINE OF lt_read.
    DATA lt_voyages  TYPE TABLE FOR READ RESULT zi_osd_fleet_voyage.
    DATA ls_voyage   LIKE LINE OF lt_voyages.
    DATA lt_update   TYPE TABLE FOR UPDATE zi_osd_fleet_voyage.
    DATA ls_update   LIKE LINE OF lt_update.
    DATA ls_failed   LIKE LINE OF failed-voyage.
    DATA ls_reported LIKE LINE OF reported-voyage.
    DATA ls_result   LIKE LINE OF result.
    DATA ls_key      LIKE LINE OF keys.

    LOOP AT keys INTO ls_key.
      CLEAR ls_read.
      ls_read-%tky = ls_key-%tky.
      APPEND ls_read TO lt_read.
    ENDLOOP.
    READ ENTITIES OF zi_osd_fleet_voyage IN LOCAL MODE
      ENTITY Voyage
        FIELDS ( status ) WITH lt_read
      RESULT lt_voyages
      FAILED failed.
    LOOP AT lt_voyages INTO ls_voyage.
      IF ls_voyage-status = 'X'.
        CLEAR: ls_failed, ls_reported.
        ls_failed-%tky = ls_voyage-%tky.
        APPEND ls_failed TO failed-voyage.
        ls_reported-%tky = ls_voyage-%tky.
        ls_reported-%msg = new_message_with_text(
          severity = if_abap_behv_message=>severity-error
          text     = 'A cancelled voyage cannot be approved' ).
        APPEND ls_reported TO reported-voyage.
        CONTINUE.
      ENDIF.
      CLEAR ls_update.
      ls_update-%tky = ls_voyage-%tky.
      ls_update-status = 'A'.
      APPEND ls_update TO lt_update.
    ENDLOOP.
    IF lt_update IS INITIAL.
      RETURN.
    ENDIF.
    MODIFY ENTITIES OF zi_osd_fleet_voyage IN LOCAL MODE
      ENTITY Voyage
        UPDATE FIELDS ( status ) WITH lt_update
      REPORTED reported.
* the action answers the voyage itself ($self)
    CLEAR: lt_read, lt_voyages.
    LOOP AT lt_update INTO ls_update.
      CLEAR ls_read.
      ls_read-%tky = ls_update-%tky.
      APPEND ls_read TO lt_read.
    ENDLOOP.
    READ ENTITIES OF zi_osd_fleet_voyage IN LOCAL MODE
      ENTITY Voyage
        ALL FIELDS WITH lt_read
      RESULT lt_voyages.
    LOOP AT lt_voyages INTO ls_voyage.
      CLEAR ls_result.
      ls_result-%tky = ls_voyage-%tky.
      MOVE-CORRESPONDING ls_voyage TO ls_result-%param.
      APPEND ls_result TO result.
    ENDLOOP.
  ENDMETHOD.

  METHOD cancel.
* a cancelled voyage is X, whatever it was
    DATA lt_update  TYPE TABLE FOR UPDATE zi_osd_fleet_voyage.
    DATA ls_update  LIKE LINE OF lt_update.
    DATA lt_read    TYPE TABLE FOR READ IMPORT zi_osd_fleet_voyage.
    DATA ls_read    LIKE LINE OF lt_read.
    DATA lt_voyages TYPE TABLE FOR READ RESULT zi_osd_fleet_voyage.
    DATA ls_voyage  LIKE LINE OF lt_voyages.
    DATA ls_result  LIKE LINE OF result.
    DATA ls_key     LIKE LINE OF keys.

    LOOP AT keys INTO ls_key.
      CLEAR ls_update.
      ls_update-%tky = ls_key-%tky.
      ls_update-status = 'X'.
      APPEND ls_update TO lt_update.
    ENDLOOP.
    MODIFY ENTITIES OF zi_osd_fleet_voyage IN LOCAL MODE
      ENTITY Voyage
        UPDATE FIELDS ( status ) WITH lt_update
      REPORTED reported.
    LOOP AT keys INTO ls_key.
      CLEAR ls_read.
      ls_read-%tky = ls_key-%tky.
      APPEND ls_read TO lt_read.
    ENDLOOP.
    READ ENTITIES OF zi_osd_fleet_voyage IN LOCAL MODE
      ENTITY Voyage
        ALL FIELDS WITH lt_read
      RESULT lt_voyages.
    LOOP AT lt_voyages INTO ls_voyage.
      CLEAR ls_result.
      ls_result-%tky = ls_voyage-%tky.
      MOVE-CORRESPONDING ls_voyage TO ls_result-%param.
      APPEND ls_result TO result.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.

CLASS lhc_stop DEFINITION INHERITING FROM cl_abap_behavior_handler FINAL.
  PRIVATE SECTION.
    METHODS recalc_voyage_steam FOR DETERMINE ON MODIFY
      IMPORTING keys FOR Stop~RecalcVoyageSteam.
ENDCLASS.

CLASS lhc_stop IMPLEMENTATION.

  METHOD recalc_voyage_steam.
* a stop was created or changed: the voyage above it needs its steam
* again. The internal action of the voyage does the work, for the voyage
* the stop belongs to -- a draft stop names the draft voyage, an active
* one the active voyage
    DATA lt_read   TYPE TABLE FOR READ IMPORT zi_osd_fleet_stop.
    DATA ls_read   LIKE LINE OF lt_read.
    DATA lt_stops  TYPE TABLE FOR READ RESULT zi_osd_fleet_stop.
    DATA ls_stop   LIKE LINE OF lt_stops.
    DATA lt_exec   TYPE TABLE FOR ACTION IMPORT zi_osd_fleet_voyage~RecalcSteam.
    DATA ls_exec   LIKE LINE OF lt_exec.
    DATA ls_key    LIKE LINE OF keys.

    LOOP AT keys INTO ls_key.
      CLEAR ls_read.
      ls_read-%tky = ls_key-%tky.
      APPEND ls_read TO lt_read.
    ENDLOOP.
    READ ENTITIES OF zi_osd_fleet_voyage IN LOCAL MODE
      ENTITY Stop
        FIELDS ( voyage_uuid ) WITH lt_read
      RESULT lt_stops.
    LOOP AT lt_stops INTO ls_stop.
      CLEAR ls_exec.
      ls_exec-voyage_uuid = ls_stop-voyage_uuid.
      ls_exec-%is_draft = ls_stop-%is_draft.
      APPEND ls_exec TO lt_exec.
    ENDLOOP.
    IF lt_exec IS INITIAL.
      RETURN.
    ENDIF.
    MODIFY ENTITIES OF zi_osd_fleet_voyage IN LOCAL MODE
      ENTITY Voyage
        EXECUTE RecalcSteam FROM lt_exec
      REPORTED reported.
  ENDMETHOD.

ENDCLASS.
