# 5. Куб CDS

Рейсы образуют аналитический куб CDS и в системе SQLite по умолчанию. Его имена и текущие ограничения зафиксированы в [контракте](../../docs/fleet-contract.md#cds-cube-chapter-5).

1. Куб. [zc_osd_fleetcube.ddls.asddls](../../src/cds/zc_osd_fleetcube.ddls.asddls) - это CDS-представление над `ZOSD_FLEET_VOY` с `@Analytics.dataCategory: #CUBE` и `@OData.publish: true`; движок публикует его как отдельный сервис. Откройте `http://localhost:8099/sap/opu/odata/sap/ZC_OSD_FLEETCUBE_CDS/ZC_OSD_FLEETCUBE?$format=json`. Ожидается: 20 строк, по одной на рейс, в каждой `SHIPID`, `DEPMONTH` (например, `202601`), `PASSENGERS`, `FUELKG` и `DISTANCEKM`. `...ZC_OSD_FLEETCUBE?$filter=SHIPID eq 'S001'&$format=json` дает шесть рейсов S001.
2. Чего куб здесь пока не делает: `...ZC_OSD_FLEETCUBE?$select=SHIPID,PASSENGERS,FUELKG&$format=json`. Ожидается на этом движке: по-прежнему 20 строк со всеми столбцами, а не одна строка на корабль: `$select` к этому сервису пока не применяется. Система группирует куб по `$select` (выбранные измерения становятся группировкой, показатели суммируются); движок пока делает это только для своих эталонных сервисов, но не для сервиса, опубликованного из CDS-представления. Месяц - это столбец, `DEP_MONTH`, потому что поддержка CDS в движке сохраняет простые столбцы и не вычисляет `substring( dep_date, 1, 6 )`.

## Под капотом

Куб в том виде, в котором он переносится:

<!-- code: src/cds/zc_osd_fleetcube.ddls.asddls -->
```sql
@AbapCatalog.sqlViewName: 'ZVOSDFLEETCUBE'
@AbapCatalog.compiler.compareFilter: true
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'osg-demo Ch5: voyage cube by ship and month'
@Analytics.dataCategory: #CUBE
@OData.publish: true
define view ZC_OSD_FLEETCUBE
  as select from zosd_fleet_voy
{
  key voyage_id as VoyageId,
      @EndUserText.label: 'Ship'
      @UI.selectionField: [{ position: 10 }]
      ship_id as ShipId,
      @EndUserText.label: 'Month'
      @UI.selectionField: [{ position: 20 }]
      dep_month as DepMonth,
      @EndUserText.label: 'Passengers'
      @Aggregation.default: #SUM
      passengers as Passengers,
      @EndUserText.label: 'Fuel (kg)'
      @Aggregation.default: #SUM
      fuel_kg as FuelKg,
      @EndUserText.label: 'Distance (km)'
      @Aggregation.default: #SUM
      distance_km as DistanceKm
}
```
