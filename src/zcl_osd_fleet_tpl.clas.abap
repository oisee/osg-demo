CLASS zcl_osd_fleet_tpl DEFINITION PUBLIC FINAL CREATE PUBLIC.
* The fleet report generated from a model: the ships and their status texts
* become a JSON model, and ZCL_OSD_TPL renders the template below over it.
* Every output line keeps a trace: the template line and the model path it
* came from. ZCL_OSD_TPL (open-steamgate) and ZCL_AJSON are not in this
* unit, so the class stays local.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    CONSTANTS c_template_name TYPE string VALUE `fleet`.
    CLASS-METHODS template
      RETURNING VALUE(rv_template) TYPE string.
    CLASS-METHODS model
      RETURNING VALUE(ri_model) TYPE REF TO zif_ajson
      RAISING zcx_ajson_error.
    CLASS-METHODS render
      RETURNING VALUE(rs_result) TYPE zcl_osd_tpl=>ty_result
      RAISING zcx_ajson_error zcx_osd_tpl.
ENDCLASS.

CLASS zcl_osd_fleet_tpl IMPLEMENTATION.
  METHOD template.
    DATA(lv_nl) = cl_abap_char_utilities=>newline.
    rv_template = `Fleet report: {{count}} airships` && lv_nl
      && `{{#airships}}` && lv_nl
      && `{{id}} {{name | pad 12}} {{status_text | pad 11}} steam {{steam_pct}}%` && lv_nl
      && `{{/airships}}` && lv_nl
      && `End of fleet report`.
  ENDMETHOD.

  METHOD model.
    DATA lv_index TYPE i.
    SELECT ship~ship_id, ship~name, ship~status, stat~text, ship~steam_pct
      FROM zosd_fleet_ship AS ship
      LEFT OUTER JOIN zosd_fleet_stat AS stat ON stat~status = ship~status
      ORDER BY ship~ship_id
      INTO TABLE @DATA(lt_ships).
    ri_model = zcl_ajson=>create_empty( ).
    ri_model->set_integer( iv_path = `/count` iv_val = lines( lt_ships ) ).
    ri_model->touch_array( `/airships` ).
    LOOP AT lt_ships INTO DATA(ls_ship).
      lv_index = sy-tabix.
      ri_model->set_string( iv_path = |/airships/{ lv_index }/id| iv_val = ls_ship-ship_id ).
      ri_model->set_string( iv_path = |/airships/{ lv_index }/name| iv_val = ls_ship-name ).
      ri_model->set_string( iv_path = |/airships/{ lv_index }/status| iv_val = ls_ship-status ).
      ri_model->set_string( iv_path = |/airships/{ lv_index }/status_text| iv_val = ls_ship-text ).
      ri_model->set_integer( iv_path = |/airships/{ lv_index }/steam_pct| iv_val = ls_ship-steam_pct ).
    ENDLOOP.
  ENDMETHOD.

  METHOD render.
    rs_result = zcl_osd_tpl=>render(
      iv_template = template( )
      ii_data     = model( )
      iv_name     = c_template_name ).
  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.
    TRY.
        DATA(ls_result) = render( ).
      CATCH zcx_ajson_error zcx_osd_tpl INTO DATA(lx_error).
        out->write( |Fleet template failed: { lx_error->get_text( ) }| ).
        RETURN.
    ENDTRY.
    LOOP AT ls_result-lines INTO DATA(lv_line).
      out->write( lv_line ).
    ENDLOOP.
    out->write( `` ).
    out->write( `Trace: output line <- template:line model path` ).
    LOOP AT ls_result-trace INTO DATA(ls_trace).
      out->write( |{ ls_trace-line } <- { ls_trace-template }:{ ls_trace-template_line } { ls_trace-path }| ).
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.
