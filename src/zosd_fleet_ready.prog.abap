* Job step 2 of the fleet chain (ZCL_OSD_FLEET_CHAIN): starts after the voyage
* job succeeded, checks its log and the ships, and records BAL log
* <run>-READY.
REPORT zosd_fleet_ready.

PARAMETERS p_run TYPE c LENGTH 32 OBLIGATORY.

START-OF-SELECTION.
  TRY.
      DATA(lv_ok) = zcl_osd_fleet_chain=>ready_step( CONV #( p_run ) ).
      COMMIT WORK.
    CATCH cx_bali_runtime INTO DATA(lx_bal).
      MESSAGE lx_bal->get_text( ) TYPE 'A'.
  ENDTRY.
  IF lv_ok = abap_false.
    MESSAGE |Fleet not ready for run { p_run }; see BAL { p_run }-READY| TYPE 'A'.
  ENDIF.
  WRITE: / |Readiness step { p_run }: fleet ready|.
