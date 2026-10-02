CLASS zcl_osd_fleet_night_run DEFINITION PUBLIC FINAL CREATE PUBLIC.
* Chapter 16: the night set ZCL_OSD_FLEET_NIGHT (src/l3/fleet_night.l3.yaml)
* run in this dialog step, mode S, for the check date 2026-10-01, then its
* gates, piles, worklist and alerts as the L3 tables hold them. DESCRIBE is
* shared with the JOBS and STATE classruns of the same set.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    CONSTANTS c_date TYPE d VALUE '20261001'.
    CLASS-METHODS describe
      IMPORTING iv_run TYPE csequence
      RETURNING VALUE(rt_lines) TYPE string_table.
ENDCLASS.

CLASS zcl_osd_fleet_night_run IMPLEMENTATION.

  METHOD if_oo_adt_classrun~main.
    DATA ls_result TYPE zcl_osd_fleet_night=>ty_result.
    DATA lt_lines TYPE string_table.
    DATA lv_line TYPE string.
    ls_result = zcl_osd_fleet_night=>run( iv_date = c_date ).
    COMMIT WORK.
    out->write( |Night set, mode S, run { ls_result-run_id }: { ls_result-status }| ).
    lt_lines = describe( ls_result-run_id ).
    LOOP AT lt_lines INTO lv_line.
      out->write( lv_line ).
    ENDLOOP.
  ENDMETHOD.

  METHOD describe.
    DATA lt_stages TYPE STANDARD TABLE OF zosd_l3_stage WITH DEFAULT KEY.
    DATA ls_stage TYPE zosd_l3_stage.
    DATA lt_piles TYPE STANDARD TABLE OF zosd_l3_pile WITH DEFAULT KEY.
    DATA ls_pile TYPE zosd_l3_pile.
    DATA lt_work TYPE STANDARD TABLE OF zosd_l3_work WITH DEFAULT KEY.
    DATA ls_work TYPE zosd_l3_work.
    DATA lt_alerts TYPE STANDARD TABLE OF zosd_l3_alert WITH DEFAULT KEY.
    DATA ls_alert TYPE zosd_l3_alert.
    DATA lt_rules TYPE zcl_osd_fleet_night=>tt_rule.
    DATA ls_rule TYPE zcl_osd_fleet_night=>ty_rule.
    DATA lv_keys TYPE string.
    DATA lv_job TYPE string.
    DATA lv_count TYPE string.

    " a filter pile counts the keys it selected, a check pile its alerts
    lt_rules = zcl_osd_fleet_night=>rules( ).

    SELECT * FROM zosd_l3_stage INTO TABLE lt_stages WHERE run_id = iv_run.
    SORT lt_stages BY stage_no.
    SELECT * FROM zosd_l3_pile INTO TABLE lt_piles WHERE run_id = iv_run.
    SORT lt_piles BY stage_no rule_name pile_no.
    LOOP AT lt_stages INTO ls_stage.
      APPEND |Stage { ls_stage-stage_no } { ls_stage-stage_name }: { ls_stage-status }| TO rt_lines.
      LOOP AT lt_piles INTO ls_pile WHERE stage_no = ls_stage-stage_no.
        CLEAR lv_job.
        IF ls_pile-job_name IS NOT INITIAL.
          lv_job = | in job { ls_pile-job_name }|.
        ENDIF.
        READ TABLE lt_rules INTO ls_rule WITH KEY rule = ls_pile-rule_name.
        IF sy-subrc = 0 AND ls_rule-filter = abap_true.
          lv_count = |{ ls_pile-alerts } keys|.
        ELSE.
          lv_count = |{ ls_pile-alerts } alerts|.
        ENDIF.
        APPEND |  { ls_pile-rule_name } pile { ls_pile-pile_no } { ls_pile-range_low }-{ ls_pile-range_high }: |
          && |{ ls_pile-status }, { lv_count }{ lv_job }| TO rt_lines.
      ENDLOOP.
    ENDLOOP.

    SELECT * FROM zosd_l3_work INTO TABLE lt_work WHERE run_id = iv_run.
    SORT lt_work BY worklist key_value.
    LOOP AT lt_work INTO ls_work.
      lv_keys = |{ lv_keys } { ls_work-key_value }|.
    ENDLOOP.
    APPEND |Worklist busy:{ lv_keys }| TO rt_lines.

    SELECT * FROM zosd_l3_alert INTO TABLE lt_alerts WHERE run_id = iv_run.
    SORT lt_alerts BY rule_name alert_seq.
    LOOP AT lt_alerts INTO ls_alert.
      APPEND |Alert { ls_alert-rule_name }: { ls_alert-alert_text }| TO rt_lines.
    ENDLOOP.
    APPEND |{ lines( lt_alerts ) } alerts| TO rt_lines.
  ENDMETHOD.

ENDCLASS.
