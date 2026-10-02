CLASS zcl_osd_fleet_watch_state DEFINITION PUBLIC FINAL CREATE PUBLIC.
* Chapter 17: the latest run of the watch set for 2026-10-01, the one whose
* first stage opened last: its gates and piles, its budget (ZOSD_L3_BUDGET)
* and the events of the run (ZOSD_L3_EVENT), then its alerts.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    CLASS-METHODS latest RETURNING VALUE(rv_run) TYPE zosd_l3_stage-run_id.
ENDCLASS.

CLASS zcl_osd_fleet_watch_state IMPLEMENTATION.

  METHOD latest.
    DATA lt_stages TYPE STANDARD TABLE OF zosd_l3_stage WITH DEFAULT KEY.
    DATA ls_stage TYPE zosd_l3_stage.
    SELECT * FROM zosd_l3_stage INTO TABLE lt_stages
      WHERE set_name = zcl_osd_fleet_watch=>c_set
        AND check_date = zcl_osd_fleet_night_run=>c_date
        AND stage_no = 1.
    SORT lt_stages BY opened DESCENDING.
    READ TABLE lt_stages INTO ls_stage INDEX 1.
    IF sy-subrc = 0.
      rv_run = ls_stage-run_id.
    ENDIF.
  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.
    DATA lv_run TYPE zosd_l3_stage-run_id.
    DATA lt_stages TYPE STANDARD TABLE OF zosd_l3_stage WITH DEFAULT KEY.
    DATA ls_stage TYPE zosd_l3_stage.
    DATA lt_piles TYPE STANDARD TABLE OF zosd_l3_pile WITH DEFAULT KEY.
    DATA ls_pile TYPE zosd_l3_pile.
    DATA ls_budget TYPE zosd_l3_budget.
    DATA lt_events TYPE zcl_osd_fleet_watch=>tt_events.
    DATA ls_event TYPE zosd_l3_event.
    DATA lt_alerts TYPE STANDARD TABLE OF zosd_l3_alert WITH DEFAULT KEY.
    DATA ls_alert TYPE zosd_l3_alert.
    DATA lv_line TYPE string.

    lv_run = latest( ).
    IF lv_run IS INITIAL.
      out->write( |No run of the watch set for { zcl_osd_fleet_night_run=>c_date }| ).
      RETURN.
    ENDIF.
    out->write( |Watch set, run { lv_run }| ).

    SELECT * FROM zosd_l3_stage INTO TABLE lt_stages WHERE run_id = lv_run.
    SORT lt_stages BY stage_no.
    SELECT * FROM zosd_l3_pile INTO TABLE lt_piles WHERE run_id = lv_run.
    SORT lt_piles BY stage_no rule_name pile_no.
    LOOP AT lt_stages INTO ls_stage.
      out->write( |Stage { ls_stage-stage_no } { ls_stage-stage_name }: { ls_stage-status }| ).
      LOOP AT lt_piles INTO ls_pile WHERE stage_no = ls_stage-stage_no.
        lv_line = |  { ls_pile-rule_name } pile { ls_pile-pile_no }: { ls_pile-status }|.
        IF ls_pile-reason IS NOT INITIAL.
          lv_line = |{ lv_line } ({ ls_pile-reason })|.
        ENDIF.
        out->write( lv_line ).
      ENDLOOP.
    ENDLOOP.

    SELECT SINGLE * FROM zosd_l3_budget INTO ls_budget WHERE run_id = lv_run.
    IF sy-subrc = 0.
      out->write( |Budget: { ls_budget-state }, glass { ls_budget-glass }, reserved { ls_budget-reserved }, |
               && |consumed { ls_budget-consumed }, refunded { ls_budget-refunded }| ).
    ENDIF.

    lt_events = zcl_osd_fleet_watch=>events( lv_run ).
    LOOP AT lt_events INTO ls_event.
      lv_line = |Event { ls_event-seq } { ls_event-kind }: glass { ls_event-glass }, reserved { ls_event-reserved }|.
      IF ls_event-amount <> 0.
        lv_line = |{ lv_line }, amount { ls_event-amount }|.
      ENDIF.
      IF ls_event-rule_name IS NOT INITIAL.
        lv_line = |{ lv_line }, { ls_event-rule_name } pile { ls_event-pile_no }|.
      ENDIF.
      IF ls_event-reason IS NOT INITIAL.
        lv_line = |{ lv_line }, "{ ls_event-reason }"|.
      ENDIF.
      IF ls_event-kind = 'CONTINUE'.
        lv_line = |{ lv_line } by { ls_event-actor }|.
      ENDIF.
      out->write( lv_line ).
    ENDLOOP.

    SELECT * FROM zosd_l3_alert INTO TABLE lt_alerts WHERE run_id = lv_run.
    SORT lt_alerts BY rule_name alert_seq.
    LOOP AT lt_alerts INTO ls_alert.
      out->write( |Alert { ls_alert-rule_name }: { ls_alert-alert_text }| ).
    ENDLOOP.
    out->write( |{ lines( lt_alerts ) } alerts| ).
  ENDMETHOD.

ENDCLASS.
