# 6. AMDP on the fleet

This optional chapter runs SQLScript from ABAP classes. The default SQLite system shows why these methods need another database. DuckDB runs the supported portable subset; HANA runs the original SQLScript. See [the contract](../docs/fleet-contract.md#amdp-chapter-6).

1. Open [ZCL_OSD_FLEET_FUEL](../src/zcl_osd_fleet_fuel.clas.abap): `fuel_per_100km` is `BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT`, one `SELECT` with `SUM` and `GROUP BY ship_id`, leaving out voyages without a distance so nothing divides by zero. Press **F9**. Expected on SQLite: `AMDP needs DuckDB or HANA; this system runs on sqlite. Start it with STG_DB=duckdb.`
2. DuckDB needs an open-steamgate checkout (the packaged extension has no DuckDB module): stop the system and start it again with `STG_DB=duckdb OSD_PACKS=/path/to/osg-demo STG_PORT=8099 npm start`, then run the class again. Expected:

   ```
   Fuel per 100 km (duckdb)
   S001: 5513 kg over 2440 km = 225.94 kg/100 km
   S002: 1788 kg over 1680 km = 106.43 kg/100 km
   S003: 5494 kg over 2440 km = 225.16 kg/100 km
   S004: 1114 kg over 980 km = 113.67 kg/100 km
   S005: 3021 kg over 1040 km = 290.48 kg/100 km
   ```

   Old Boiler has no voyages, so it has no line. The engine translated the SQLScript into DuckDB SQL; the source in `src/` is unchanged.
3. Open [ZCL_OSD_FLEET_SUMMARY](../src/zcl_osd_fleet_summary.clas.abap) and press **F9**. Its second read-only AMDP joins ships to voyages, groups by ship and keeps ships with no voyages through a `LEFT OUTER JOIN`. The classrun reads the same tables through Open SQL and checks every result. Expected on DuckDB: `Fleet summary (duckdb); checked against Open SQL`, six ship lines, from `S001 A: 6 voyages, 305 passengers, 2440 km` to `S006 M: 0 voyages, 0 passengers, 0 km`, then `MATCH: 6 ships`. On SQLite it prints the same database requirement as step 1.
4. On HANA Express, run both classes as [Running on HANA](../docs/hana.md) describes (`STG_DB=hana`, or `osd.database.system` = `hana`). Expected: both headings say `(HDB)`; the fuel lines and six summary lines match DuckDB. Here the SQLScript runs on HANA as written. [The HANA checklist](../docs/hana.md#chapter-6-on-hana) lists what to check.

## Under the hood

SQLScript inside ABAP: fuel per 100 km for every ship that flew:

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
