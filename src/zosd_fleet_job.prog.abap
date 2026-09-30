* The fleet audit as a background job step. ZCL_OSD_FLEET_JOB submits it
* VIA JOB with the run ID and the expected ship count; the step records one
* BAL log under ZOSD_FLEET/AUDIT whose external ID is the run ID.
REPORT zosd_fleet_job.

PARAMETERS p_run TYPE c LENGTH 32 OBLIGATORY.
PARAMETERS p_ships TYPE i DEFAULT 6.

START-OF-SELECTION.
  TRY.
      DATA(lv_handle) = zcl_osd_fleet_bal=>record(
        iv_run_id = CONV #( p_run )
        iv_expected_ships = p_ships ).
      COMMIT WORK.
      WRITE: / |Fleet audit job { p_run }: BAL { lv_handle }|.
    CATCH cx_bali_runtime INTO DATA(lx_bal).
      ROLLBACK WORK.
      MESSAGE lx_bal->get_text( ) TYPE 'A'.
  ENDTRY.
