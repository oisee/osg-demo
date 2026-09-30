REPORT zosd_fleet_balv.
* The fleet's business log as a classic ALV (CL_SALV_TABLE): one row per BAL
* message under ZOSD_FLEET/AUDIT, from ZCL_OSD_FLEET_BAL_VIEW=>MESSAGES. A
* demo view of the log, not transaction SLG1.
*
* Written for the open-steamgate report converter, which runs it as
* transaction ZGUI_OSD_FLEET_BALV; like ZOSD_FLEET_ALV it uses built-in row
* types and MODIFY ... INDEX (see that report's header). On a system it runs
* as it is.

TYPES: BEGIN OF ty_row,
         run_id   TYPE c LENGTH 40,
         item     TYPE i,
         severity TYPE c LENGTH 1,
         text     TYPE c LENGTH 80,
         utc      TYPE c LENGTH 14,
       END OF ty_row.

DATA gt_rows     TYPE STANDARD TABLE OF ty_row WITH DEFAULT KEY.
DATA gs_row      TYPE ty_row.
DATA gt_messages TYPE zcl_osd_fleet_bal_view=>tt_message.
DATA gs_message  TYPE zcl_osd_fleet_bal_view=>ty_message.
DATA go_alv      TYPE REF TO cl_salv_table.
DATA gx_salv     TYPE REF TO cx_salv_msg.
DATA gx_bal      TYPE REF TO cx_bali_runtime.

START-OF-SELECTION.
  TRY.
      gt_messages = zcl_osd_fleet_bal_view=>messages( ).
    CATCH cx_bali_runtime INTO gx_bal.
      WRITE: / |No fleet business log to show: { gx_bal->get_text( ) }|.
      RETURN.
  ENDTRY.
  LOOP AT gt_messages INTO gs_message.
    CLEAR gs_row.
    gs_row-run_id = gs_message-run_id.
    gs_row-item = gs_message-item.
    gs_row-severity = gs_message-severity.
    gs_row-text = gs_message-text.
    gs_row-utc = gs_message-utc.
    APPEND gs_row TO gt_rows.
  ENDLOOP.
  SORT gt_rows BY run_id item.

  TRY.
      cl_salv_table=>factory(
        IMPORTING
          r_salv_table = go_alv
        CHANGING
          t_table      = gt_rows ).
    CATCH cx_salv_msg INTO gx_salv.
      WRITE: / gx_salv->get_text( ).
      RETURN.
  ENDTRY.
  go_alv->display( ).
