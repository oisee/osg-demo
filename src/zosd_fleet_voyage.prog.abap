* Job step 1 of the fleet chain (ZCL_OSD_FLEET_CHAIN): counts the voyages and
* records BAL log <run>-VOY. When the count matches, it commits the log and
* then raises ZOSD_FLEET_VOYAGE_DONE with the run ID, which starts the
* readiness job. A count other than P_VOYS commits the log with its error
* and aborts the job without raising the event.
REPORT zosd_fleet_voyage.

PARAMETERS p_run TYPE c LENGTH 32 OBLIGATORY.
PARAMETERS p_voys TYPE i DEFAULT 20.

START-OF-SELECTION.
  DATA lv_ok TYPE abap_bool.
  TRY.
      lv_ok = zcl_osd_fleet_chain=>voyage_step(
        iv_run_id = CONV #( p_run ) iv_expected_voyages = p_voys ).
      COMMIT WORK.
    CATCH cx_bali_runtime INTO DATA(lx_bal).
      MESSAGE lx_bal->get_text( ) TYPE 'A'.
  ENDTRY.
  IF lv_ok = abap_false.
    MESSAGE |Voyage step failed for run { p_run }; see BAL { p_run }-VOY| TYPE 'A'.
  ENDIF.
* the last thing the step does: a raise is not undone by a later ROLLBACK
  CALL FUNCTION 'BP_EVENT_RAISE'
    EXPORTING eventid = zcl_osd_fleet_chain=>c_event eventparm = p_run
    EXCEPTIONS OTHERS = 1.
  IF sy-subrc <> 0.
    MESSAGE |Voyage step { p_run } could not raise { zcl_osd_fleet_chain=>c_event }| TYPE 'A'.
  ENDIF.
  WRITE: / |Voyage step { p_run }: OK|.
