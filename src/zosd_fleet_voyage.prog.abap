* Job step 1 of the fleet chain (ZCL_OSD_FLEET_CHAIN): counts the voyages and
* records BAL log <run>-VOY. A count other than P_VOYS commits that log with
* its error and then aborts the job, so no successor starts.
REPORT zosd_fleet_voyage.

PARAMETERS p_run TYPE c LENGTH 32 OBLIGATORY.
PARAMETERS p_voys TYPE i DEFAULT 20.

START-OF-SELECTION.
  TRY.
      DATA(lv_ok) = zcl_osd_fleet_chain=>voyage_step(
        iv_run_id = CONV #( p_run ) iv_expected_voyages = p_voys ).
      COMMIT WORK.
    CATCH cx_bali_runtime INTO DATA(lx_bal).
      MESSAGE lx_bal->get_text( ) TYPE 'A'.
  ENDTRY.
  IF lv_ok = abap_false.
    MESSAGE |Voyage step failed for run { p_run }; see BAL { p_run }-VOY| TYPE 'A'.
  ENDIF.
  WRITE: / |Voyage step { p_run }: OK|.
