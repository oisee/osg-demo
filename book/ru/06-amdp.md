# 6. AMDP на флоте

В этой необязательной главе SQLScript запускается из классов ABAP. Система SQLite по умолчанию показывает, почему этим методам нужна другая база данных. DuckDB выполняет поддерживаемое переносимое подмножество; HANA выполняет исходный SQLScript. См. [контракт](../../docs/fleet-contract.md#amdp-chapter-6).

1. Откройте [ZCL_OSD_FLEET_FUEL](../../src/zcl_osd_fleet_fuel.clas.abap): `fuel_per_100km` объявлен как `BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT`, это один `SELECT` с `SUM` и `GROUP BY ship_id`, который исключает рейсы без расстояния, чтобы ничего не делилось на ноль. Нажмите **F9**. Ожидается на SQLite: `AMDP needs DuckDB or HANA; this system runs on sqlite. Start it with STG_DB=duckdb.`
2. Для DuckDB нужен checkout open-steamgate (в упакованном расширении нет модуля DuckDB): остановите систему и снова запустите ее командой `STG_DB=duckdb OSD_PACKS=/path/to/osg-demo STG_PORT=8099 npm start`, затем снова запустите класс. Ожидается:

   ```
   Fuel per 100 km (duckdb)
   S001: 5513 kg over 2440 km = 225.94 kg/100 km
   S002: 1788 kg over 1680 km = 106.43 kg/100 km
   S003: 5494 kg over 2440 km = 225.16 kg/100 km
   S004: 1114 kg over 980 km = 113.67 kg/100 km
   S005: 3021 kg over 1040 km = 290.48 kg/100 km
   ```

   У Old Boiler нет рейсов, поэтому для него нет строки. Движок перевел SQLScript в SQL DuckDB; исходный код в `src/` не изменился.
3. Откройте [ZCL_OSD_FLEET_SUMMARY](../../src/zcl_osd_fleet_summary.clas.abap) и нажмите **F9**. Его второй AMDP, только для чтения, соединяет корабли с рейсами, группирует по кораблю и сохраняет корабли без рейсов с помощью `LEFT OUTER JOIN`. Метод classrun читает те же таблицы через Open SQL и проверяет каждый результат. Ожидается на DuckDB: `Fleet summary (duckdb); checked against Open SQL`, шесть строк кораблей, от `S001 A: 6 voyages, 305 passengers, 2440 km` до `S006 M: 0 voyages, 0 passengers, 0 km`, затем `MATCH: 6 ships`. На SQLite выводится то же требование к базе данных, что и в шаге 1.
4. На HANA Express запустите оба класса, как описано в [Running on HANA](../../docs/hana.md) (`STG_DB=hana` или `osd.database.system` = `hana`). Ожидается: оба заголовка содержат `(HDB)`; строки расхода топлива и шесть строк сводки совпадают с DuckDB. Здесь SQLScript выполняется на HANA в исходном виде. [Чек-лист HANA](../../docs/hana.md#chapter-6-on-hana) перечисляет, что нужно проверить.

## Под капотом

SQLScript внутри ABAP: топливо на 100 км для каждого летавшего корабля:

<!-- code: src/zcl_osd_fleet_fuel.clas.abap method fuel_per_100km -->
```abap
METHOD fuel_per_100km BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT
                      OPTIONS READ-ONLY USING zosd_fleet_voy.
  et_fuel = SELECT ship_id,
                   CAST(SUM(fuel_kg) AS INTEGER) AS fuel_kg,
                   CAST(SUM(distance_km) AS INTEGER) AS distance_km,
                   ROUND( CAST(SUM(fuel_kg) AS INTEGER) * 100
                          / CAST(SUM(distance_km) AS INTEGER), 2 ) AS fuel_per_100km
              FROM zosd_fleet_voy
             WHERE mandt = CAST(:iv_client AS NVARCHAR(3))
               AND distance_km > 0
             GROUP BY ship_id
             ORDER BY ship_id;
ENDMETHOD.
```
