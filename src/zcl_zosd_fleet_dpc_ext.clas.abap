CLASS zcl_zosd_fleet_dpc_ext DEFINITION
  PUBLIC
  INHERITING FROM zcl_zosd_fleet_dpc
  CREATE PUBLIC.

* The hand-written part of ZOSD_FLEET_SRV (docs/fleet-contract.md).
*
* ShipSet is served here with Open SQL over ZOSD_FLEET_SHIP, because the
* entity carries StatusText, which the table has no column for: this class
* fills it from ZOSD_FLEET_STAT. VoyageSet is served by SADL over
* ZOSD_FLEET_VOY; this class only answers the navigation Ship/Voyages,
* which a table source has no association binding for.

  PUBLIC SECTION.
  PROTECTED SECTION.
    METHODS shipset_get_entityset REDEFINITION.
    METHODS shipset_get_entity REDEFINITION.
    METHODS shipset_create_entity REDEFINITION.
    METHODS shipset_update_entity REDEFINITION.
    METHODS shipset_delete_entity REDEFINITION.
    METHODS voyageset_get_entityset REDEFINITION.
  PRIVATE SECTION.
    TYPES ty_ship_id TYPE c LENGTH 4.
    TYPES: BEGIN OF ty_range,
             sign   TYPE c LENGTH 1,
             option TYPE c LENGTH 2,
             low    TYPE c LENGTH 30,
             high   TYPE c LENGTH 30,
           END OF ty_range.
    TYPES ty_ranges TYPE STANDARD TABLE OF ty_range WITH DEFAULT KEY.

    METHODS ranges_for
      IMPORTING
        iv_property      TYPE string
        it_filter        TYPE /iwbep/t_mgw_select_option
      RETURNING
        VALUE(rt_ranges) TYPE ty_ranges.

    METHODS ship_id_from
      IMPORTING
        it_key_tab        TYPE /iwbep/t_mgw_name_value_pair
      RETURNING
        VALUE(rv_ship_id) TYPE ty_ship_id
      RAISING
        /iwbep/cx_mgw_busi_exception.

    METHODS fill_status_text
      CHANGING
        ct_ship TYPE zcl_zosd_fleet_mpc=>tt_ship.

    METHODS order_ship
      IMPORTING
        it_order TYPE /iwbep/t_mgw_sorting_order
      CHANGING
        ct_ship  TYPE zcl_zosd_fleet_mpc=>tt_ship
      RAISING
        /iwbep/cx_mgw_busi_exception.
ENDCLASS.



CLASS zcl_zosd_fleet_dpc_ext IMPLEMENTATION.

  METHOD ranges_for.
    DATA ls_filter TYPE /iwbep/s_mgw_select_option.
    DATA ls_option TYPE /iwbep/s_cod_select_option.
    DATA ls_range  TYPE ty_range.

    LOOP AT it_filter INTO ls_filter.
      IF to_upper( ls_filter-property ) <> to_upper( iv_property ).
        CONTINUE.
      ENDIF.
      LOOP AT ls_filter-select_options INTO ls_option.
        ls_range-sign   = ls_option-sign.
        ls_range-option = ls_option-option.
        ls_range-low    = ls_option-low.
        ls_range-high   = ls_option-high.
        APPEND ls_range TO rt_ranges.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD ship_id_from.
    DATA ls_key TYPE /iwbep/s_mgw_name_value_pair.

    READ TABLE it_key_tab INTO ls_key WITH KEY name = 'ShipId'.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message = 'Key ShipId missing'.
    ENDIF.
    rv_ship_id = ls_key-value.
  ENDMETHOD.

  METHOD fill_status_text.
    DATA lt_status TYPE STANDARD TABLE OF zosd_fleet_stat.
    DATA ls_status LIKE LINE OF lt_status.
    FIELD-SYMBOLS <ls_ship> LIKE LINE OF ct_ship.

    IF ct_ship IS INITIAL.
      RETURN.
    ENDIF.
    SELECT * FROM zosd_fleet_stat INTO TABLE lt_status.
    LOOP AT ct_ship ASSIGNING <ls_ship>.
      READ TABLE lt_status INTO ls_status WITH KEY status = <ls_ship>-status.
      IF sy-subrc = 0.
        <ls_ship>-status_text = ls_status-text.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD shipset_get_entityset.
    DATA lt_ship_id   TYPE ty_ranges.
    DATA lt_name      TYPE ty_ranges.
    DATA lt_status    TYPE ty_ranges.
    DATA lt_steam_pct TYPE ty_ranges.
    DATA lt_home_port TYPE ty_ranges.
    DATA lv_search    TYPE string.
    DATA lv_skip      TYPE i.
    DATA lv_top       TYPE i.
    DATA lv_index     TYPE i.
    FIELD-SYMBOLS <ls_ship> LIKE LINE OF et_entityset.

    lt_ship_id = ranges_for( iv_property = 'ShipId'
                             it_filter   = it_filter_select_options ).
    lt_name = ranges_for( iv_property = 'Name'
                          it_filter   = it_filter_select_options ).
    lt_status = ranges_for( iv_property = 'Status'
                            it_filter   = it_filter_select_options ).
    lt_steam_pct = ranges_for( iv_property = 'SteamPct'
                               it_filter   = it_filter_select_options ).
    lt_home_port = ranges_for( iv_property = 'HomePort'
                               it_filter   = it_filter_select_options ).

    SELECT ship_id name status steam_pct home_port
      FROM zosd_fleet_ship
      INTO CORRESPONDING FIELDS OF TABLE et_entityset
      WHERE ship_id IN lt_ship_id
        AND name IN lt_name
        AND status IN lt_status
        AND steam_pct IN lt_steam_pct
        AND home_port IN lt_home_port
      ORDER BY ship_id.

* the filter bar's search field: the id or the name contains the text
    IF iv_search_string IS NOT INITIAL.
      lv_search = to_upper( iv_search_string ).
      LOOP AT et_entityset ASSIGNING <ls_ship>.
        IF to_upper( <ls_ship>-name ) NS lv_search AND to_upper( <ls_ship>-ship_id ) NS lv_search.
          DELETE et_entityset.
        ENDIF.
      ENDLOOP.
    ENDIF.
    fill_status_text( CHANGING ct_ship = et_entityset ).
    order_ship( EXPORTING it_order = it_order CHANGING ct_ship = et_entityset ).

* $inlinecount counts every matching row, before the page is cut
    es_response_context-inlinecount = |{ lines( et_entityset ) }|.

    lv_skip = is_paging-skip.
    lv_top  = is_paging-top.
    IF lv_skip > 0.
      DO lv_skip TIMES.
        DELETE et_entityset INDEX 1.
      ENDDO.
    ENDIF.
    IF lv_top > 0.
      lv_index = lv_top + 1.
      WHILE lines( et_entityset ) >= lv_index.
        DELETE et_entityset INDEX lv_index.
      ENDWHILE.
    ENDIF.
  ENDMETHOD.

  METHOD order_ship.
    DATA lv_index TYPE i.
    DATA ls_order TYPE /iwbep/s_mgw_sorting_order.
    DATA lv_desc  TYPE abap_bool.

    lv_index = lines( it_order ).
    WHILE lv_index >= 1.
      READ TABLE it_order INDEX lv_index INTO ls_order.
      lv_desc = boolc( to_lower( ls_order-order ) = 'desc' ).
      CASE to_upper( ls_order-property ).
        WHEN 'SHIPID'.
          IF lv_desc = abap_true.
            SORT ct_ship BY ship_id DESCENDING.
          ELSE.
            SORT ct_ship BY ship_id ASCENDING.
          ENDIF.
        WHEN 'NAME'.
          IF lv_desc = abap_true.
            SORT ct_ship BY name DESCENDING.
          ELSE.
            SORT ct_ship BY name ASCENDING.
          ENDIF.
        WHEN 'STATUS'.
          IF lv_desc = abap_true.
            SORT ct_ship BY status DESCENDING.
          ELSE.
            SORT ct_ship BY status ASCENDING.
          ENDIF.
        WHEN 'STEAMPCT'.
          IF lv_desc = abap_true.
            SORT ct_ship BY steam_pct DESCENDING.
          ELSE.
            SORT ct_ship BY steam_pct ASCENDING.
          ENDIF.
        WHEN 'HOMEPORT'.
          IF lv_desc = abap_true.
            SORT ct_ship BY home_port DESCENDING.
          ELSE.
            SORT ct_ship BY home_port ASCENDING.
          ENDIF.
        WHEN OTHERS.
          RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
            EXPORTING
              message = |$orderby: ShipSet has no sortable property { ls_order-property }|.
      ENDCASE.
      lv_index = lv_index - 1.
    ENDWHILE.
  ENDMETHOD.

  METHOD shipset_get_entity.
    DATA lv_ship_id TYPE ty_ship_id.

    lv_ship_id = ship_id_from( it_key_tab ).
    SELECT SINGLE ship_id name status steam_pct home_port
      FROM zosd_fleet_ship
      INTO CORRESPONDING FIELDS OF er_entity
      WHERE ship_id = lv_ship_id.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message = |Ship { lv_ship_id } does not exist|.
    ENDIF.
    SELECT SINGLE text FROM zosd_fleet_stat
      INTO er_entity-status_text
      WHERE status = er_entity-status.
  ENDMETHOD.

  METHOD shipset_create_entity.
    DATA ls_row TYPE zosd_fleet_ship.

    io_data_provider->read_entry_data( IMPORTING es_data = er_entity ).
    IF er_entity-ship_id IS INITIAL.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message = 'ShipId is required'.
    ENDIF.
    ls_row-mandt = sy-mandt.
    MOVE-CORRESPONDING er_entity TO ls_row.
    INSERT zosd_fleet_ship FROM ls_row.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message = |Ship { er_entity-ship_id } already exists|.
    ENDIF.
    SELECT SINGLE text FROM zosd_fleet_stat
      INTO er_entity-status_text
      WHERE status = er_entity-status.
  ENDMETHOD.

  METHOD shipset_update_entity.
    DATA lv_ship_id TYPE ty_ship_id.
    DATA ls_row     TYPE zosd_fleet_ship.

    lv_ship_id = ship_id_from( it_key_tab ).
    io_data_provider->read_entry_data( IMPORTING es_data = er_entity ).
    er_entity-ship_id = lv_ship_id.

    SELECT SINGLE * FROM zosd_fleet_ship INTO ls_row WHERE ship_id = lv_ship_id.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message = |Ship { lv_ship_id } does not exist|.
    ENDIF.
    MOVE-CORRESPONDING er_entity TO ls_row.
    UPDATE zosd_fleet_ship FROM ls_row.
    SELECT SINGLE text FROM zosd_fleet_stat
      INTO er_entity-status_text
      WHERE status = er_entity-status.
  ENDMETHOD.

  METHOD shipset_delete_entity.
    DATA lv_ship_id TYPE ty_ship_id.

    lv_ship_id = ship_id_from( it_key_tab ).
    DELETE FROM zosd_fleet_ship WHERE ship_id = lv_ship_id.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message = |Ship { lv_ship_id } does not exist|.
    ENDIF.
  ENDMETHOD.

  METHOD voyageset_get_entityset.
    DATA lv_ship_id TYPE ty_ship_id.

* ShipSet('S001')/Voyages: the parent key arrives in it_key_tab
    IF it_navigation_path IS INITIAL.
      super->voyageset_get_entityset(
        EXPORTING
          iv_entity_name           = iv_entity_name
          iv_entity_set_name       = iv_entity_set_name
          iv_source_name           = iv_source_name
          it_filter_select_options = it_filter_select_options
          is_paging                = is_paging
          it_key_tab               = it_key_tab
          it_navigation_path       = it_navigation_path
          it_order                 = it_order
          iv_filter_string         = iv_filter_string
          iv_search_string         = iv_search_string
          io_tech_request_context  = io_tech_request_context
        IMPORTING
          et_entityset             = et_entityset
          es_response_context      = es_response_context ).
      RETURN.
    ENDIF.

    lv_ship_id = ship_id_from( it_key_tab ).
    SELECT * FROM zosd_fleet_voy
      INTO CORRESPONDING FIELDS OF TABLE et_entityset
      WHERE ship_id = lv_ship_id
      ORDER BY dep_date voyage_id.
  ENDMETHOD.
ENDCLASS.
