# 3. The OData ladder

`ZOSD_FLEET_SRV` is defined in one file, [zosd_fleet.stg.yaml](../src/zosd_fleet.stg.yaml); the engine compiles it into the SEGW project, the model and the data provider at start. [ZCL_ZOSD_FLEET_DPC_EXT](../src/zcl_zosd_fleet_dpc_ext.clas.abap) is the hand-written part. The URLs below assume port 8099; any browser shows the `GET`s.

1. `$metadata`: open `http://localhost:8099/sap/opu/odata/sap/ZOSD_FLEET_SRV/$metadata`. Expected: three entity sets, `ShipSet`, `VoyageSet` and `StatusVHSet`; `Ship` has the navigation property `Voyages`, and the annotations give `Ship/Status` a value list.
2. Query: `.../ShipSet?$format=json`. Expected: six ships, each with `StatusText` (`Aloft`, `Docked` or `Maintenance`) next to its `Status`. `ShipSet/$count` answers `6`. `StatusText` is not a column of `ZOSD_FLEET_SHIP`; `shipset_get_entityset` fills it from `ZOSD_FLEET_STAT`.
3. Filter: `.../ShipSet?$filter=Status eq 'A'&$format=json`. Expected: S001 Albatross and S003 Brass Heron, the two aloft ships. Try `$orderby=SteamPct desc` and `$top=2&$inlinecount=allpages`: the page has two rows and `__count` stays `6`.
4. Change a ship with MERGE, using the commands of chapter 2 step 4 with `-d '{"SteamPct":55}'` on `ShipSet('S002')`. Expected: HTTP 204; `.../ShipSet('S002')?$format=json` then reads `"SteamPct":55`, and `Name` is still `Nimbus`, because MERGE changes only the fields it sends. `shipset_update_entity` writes the row.
5. Value help: `.../StatusVHSet?$format=json`. Expected: three rows, `A` Aloft, `D` Docked, `M` Maintenance, served by the elementary search help `ZOSD_FLEET_STATUS_SH`. `.../StatusVHSet('A')` answers the single row.
6. Navigation: `.../ShipSet('S001')/Voyages?$format=json`. Expected: S001's six voyages, from `V00001` in January to later in the year. `.../ShipSet('S006')/Voyages` is empty: Old Boiler never left port. `voyageset_get_entityset` serves this navigation, because a `table:` source has no association binding yet.

## Under the hood

The service is described in YAML; this is the ship entity:

<!-- code: src/zosd_fleet.stg.yaml lines 17-28 -->
```yaml
Ship:
  set: ShipSet
  keys: [ShipId]
  searchable: true
  properties:
    ShipId: {type: String(4), field: SHIP_ID, label: Ship}
    Name: {type: String(30), field: NAME, label: Name}
    Status: {type: String(1), field: STATUS, label: Status}
    SteamPct: {type: Int32, field: STEAM_PCT, label: Steam (%)}
    HomePort: {type: String(20), field: HOME_PORT, label: Home port}
    # read-only, the DPC_EXT fills it from ZOSD_FLEET_STAT
    StatusText: {type: String(20), field: STATUS_TEXT, readonly: true, sortable: false, filterable: false, label: Status text}
```

The hand-written DPC_EXT adds the status text to every ship it returns:

<!-- code: src/zcl_zosd_fleet_dpc_ext.clas.abap method fill_status_text -->
```abap
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
```
