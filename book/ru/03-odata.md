# 3. Лестница OData

`ZOSD_FLEET_SRV` определен в одном файле, [zosd_fleet.stg.yaml](../../src/zosd_fleet.stg.yaml); при запуске движок компилирует его в проект SEGW, модель и поставщик данных (data provider). [ZCL_ZOSD_FLEET_DPC_EXT](../../src/zcl_zosd_fleet_dpc_ext.clas.abap) - часть, написанная вручную. URL ниже предполагают порт 8099; запросы `GET` можно открыть в любом браузере.

1. `$metadata`: откройте `http://localhost:8099/sap/opu/odata/sap/ZOSD_FLEET_SRV/$metadata`. Ожидается: три набора сущностей, `ShipSet`, `VoyageSet` и `StatusVHSet`; у `Ship` есть свойство навигации `Voyages`, а аннотации задают для `Ship/Status` список значений.
2. Запрос: `.../ShipSet?$format=json`. Ожидается: шесть кораблей, у каждого `StatusText` (`Aloft`, `Docked` или `Maintenance`) рядом с его `Status`. `ShipSet/$count` отвечает `6`. `StatusText` не является столбцом `ZOSD_FLEET_SHIP`; `shipset_get_entityset` заполняет его из `ZOSD_FLEET_STAT`.
3. Фильтр: `.../ShipSet?$filter=Status eq 'A'&$format=json`. Ожидается: S001 Albatross и S003 Brass Heron, два корабля в воздухе. Попробуйте `$orderby=SteamPct desc` и `$top=2&$inlinecount=allpages`: на странице две строки, а `__count` остается `6`.
4. Измените корабль с помощью MERGE, используя команды из главы 2, шаг 4, с `-d '{"SteamPct":55}'` для `ShipSet('S002')`. Ожидается: HTTP 204; после этого `.../ShipSet('S002')?$format=json` возвращает `"SteamPct":55`, а `Name` по-прежнему `Nimbus`, потому что MERGE изменяет только переданные поля. Строку записывает `shipset_update_entity`.
5. Справка по значениям: `.../StatusVHSet?$format=json`. Ожидается: три строки, `A` Aloft, `D` Docked, `M` Maintenance, которые предоставляет элементарное средство поиска `ZOSD_FLEET_STATUS_SH`. `.../StatusVHSet('A')` возвращает одну строку.
6. Навигация: `.../ShipSet('S001')/Voyages?$format=json`. Ожидается: шесть рейсов S001, от `V00001` в январе до более поздних в течение года. `.../ShipSet('S006')/Voyages` пуст: Old Boiler никогда не покидал порт. Эту навигацию обслуживает `voyageset_get_entityset`, потому что у источника `table:` пока нет привязки ассоциации.

## Под капотом

Сервис описан в YAML; вот сущность корабля:

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

Написанный вручную DPC_EXT добавляет текст статуса к каждому возвращаемому кораблю:

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
