CLASS zcl_osd_fleet_tran DEFINITION PUBLIC FINAL CREATE PUBLIC.
* Transaction ZOSD_FLEET (docs/fleet-contract.md, "ABAP"): the fleet report's
* lines on a screen. It implements ZIF_OSD_TRANSACTION, the engine's contract
* for a transaction class, and draws through cl_gui_html_viewer. It has no
* events and no state: every dialog step shows the fleet as it is now. It
* does not SUBMIT the report (not implemented); it calls ship_lines( ).
  PUBLIC SECTION.
    INTERFACES zif_osd_transaction.

    METHODS document
      RETURNING
        VALUE(rv_html) TYPE string.

  PRIVATE SECTION.
    DATA mo_container TYPE REF TO cl_gui_custom_container.
    DATA mo_viewer    TYPE REF TO cl_gui_html_viewer.
ENDCLASS.



CLASS zcl_osd_fleet_tran IMPLEMENTATION.

  METHOD zif_osd_transaction~title.
    rv_title = 'Airship fleet'.
  ENDMETHOD.

  METHOD zif_osd_transaction~message.
    CLEAR rv_message.
  ENDMETHOD.

  METHOD zif_osd_transaction~roll_in.
* nothing to restore: the screen always shows the current fleet
  ENDMETHOD.

  METHOD zif_osd_transaction~roll_out.
    CLEAR rv_state.
  ENDMETHOD.

  METHOD document.
    DATA lo_report TYPE REF TO zcl_osd_fleet_report.
    DATA lt_lines  TYPE string_table.
    DATA lv_line   TYPE string.
    DATA lv_list   TYPE string.

    CREATE OBJECT lo_report.
    lt_lines = lo_report->ship_lines( ).
    LOOP AT lt_lines INTO lv_line.
      lv_list = lv_list && |<li>{ cl_gui_control=>escape_html( lv_line ) }</li>|.
    ENDLOOP.

    rv_html =
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>` &&
      `body{font:13px system-ui,sans-serif;margin:0;padding:10px;background:#fff;color:#222}` &&
      `h2{margin:0 0 8px;font-size:14px;font-weight:600;color:#1f4e79}` &&
      `ul.fleet{margin:0 0 0 18px;padding:0}ul.fleet li{margin:2px 0}` &&
      `</style></head><body>` &&
      `<h2>Airship fleet</h2>` &&
      `<ul class="fleet">` && lv_list && `</ul>` &&
      `</body></html>`.
  ENDMETHOD.

  METHOD zif_osd_transaction~pbo.
    DATA lt_html TYPE STANDARD TABLE OF string WITH DEFAULT KEY.
    DATA lv_html TYPE string.
    DATA lv_url  TYPE c LENGTH 255.

    CREATE OBJECT mo_container
      EXPORTING
        container_name = 'OSD_FLEET'.
    CREATE OBJECT mo_viewer
      EXPORTING
        parent = mo_container.

    lv_html = document( ).
    APPEND lv_html TO lt_html.
    CALL METHOD mo_viewer->load_data
      EXPORTING
        type         = 'text'
        subtype      = 'html'
        size         = strlen( lv_html )
      IMPORTING
        assigned_url = lv_url
      CHANGING
        data_table   = lt_html
      EXCEPTIONS
        OTHERS       = 1.
    IF sy-subrc = 0.
      CALL METHOD mo_viewer->show_url
        EXPORTING
          url    = lv_url
        EXCEPTIONS
          OTHERS = 1.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
