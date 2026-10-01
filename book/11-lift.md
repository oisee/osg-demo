# 11. Lift a legacy routine

[ZCL_OSD_FLEET_LIFT](../src/zcl_osd_fleet_lift.clas.abap) holds a routine as it
is often found: `BEFORE` loops over the voyages and reads each ship's name
with its own `SELECT SINGLE`. `AFTER` is the lifted form from open-steamgate's
verified lift, recipe R1:
one `SELECT ... FOR ALL ENTRIES` into a hashed table, then a `READ TABLE` per
voyage that sets the name only on a hit. The code between
`" lift:R1 begin` and `" lift:R1 end` is generated, not written by hand.

1. In an open-steamgate checkout with a build, run
   `OSD_HOME=/path/to/open-steamgate node test/lift.mjs`. Expected: the model
   it read out of `BEFORE` (`zosd_fleet_ship by ship_id; fields name ->
   ship_name`), three open obligations the recipe leaves to you (no
   concurrent writes during the loop, one client, `sy-subrc`/`sy-dbcnt` not
   read afterwards), and `AFTER's 14 generated lines match the template`.
   `--write` regenerates the region after a change to `BEFORE`.
2. Open the class and press **F9**. Expected:
   `BEFORE and AFTER agree on 20 voyages.` and the first three voyages with
   their ship names, from `V00001 S001 Albatross`.
3. Run the class in Testing. Its four HARMLESS tests run both methods on the
   same rows: the seeded voyages, an unknown ship that keeps its old name,
   the same ship twice with a stale name, and no voyages at all.
4. Try it on a copy of `BEFORE`: add a condition that is not a key column
   to its `WHERE` (for example `AND status = 'A'`), or type the key
   component `ship_id` differently from the column (for example
   `TYPE c LENGTH 10`), and run step 1 again: `lift: R1 refused -- ...`
   says which obligation it could not close. The lift checks the key's
   types; a hand-typed target like `ship_name` is not checked.

The tests compare results, not cost: the `IS NOT INITIAL` guard before the
`FOR ALL ENTRIES` only matters for the database calls (an empty table would
otherwise read every ship), and only the drift check in step 1 protects it.

## Under the hood

Before: one database read per voyage.

<!-- code: src/zcl_osd_fleet_lift.clas.abap method before -->
```abap
METHOD before.
  FIELD-SYMBOLS <ls_voyage> LIKE LINE OF ct_voyages.
  LOOP AT ct_voyages ASSIGNING <ls_voyage>.
    SELECT SINGLE name FROM zosd_fleet_ship INTO <ls_voyage>-ship_name
      WHERE ship_id = <ls_voyage>-ship_id.
  ENDLOOP.
ENDMETHOD.
```

After: one read for all voyages; the region between the markers is generated.

<!-- code: src/zcl_osd_fleet_lift.clas.abap method after -->
```abap
METHOD after.
  FIELD-SYMBOLS <ls_voyage> LIKE LINE OF ct_voyages.
  " lift:R1 begin
  DATA lt_lookup TYPE HASHED TABLE OF zosd_fleet_ship WITH UNIQUE KEY ship_id.
  FIELD-SYMBOLS <ls_lookup> LIKE LINE OF lt_lookup.
  IF ct_voyages IS NOT INITIAL.
    SELECT ship_id name FROM zosd_fleet_ship
      INTO CORRESPONDING FIELDS OF TABLE lt_lookup
      FOR ALL ENTRIES IN ct_voyages
      WHERE ship_id = ct_voyages-ship_id.
  ENDIF.
  LOOP AT ct_voyages ASSIGNING <ls_voyage>.
    READ TABLE lt_lookup ASSIGNING <ls_lookup> WITH TABLE KEY ship_id = <ls_voyage>-ship_id.
    IF sy-subrc = 0.
      <ls_voyage>-ship_name = <ls_lookup>-name.
    ENDIF.
  ENDLOOP.
  " lift:R1 end
ENDMETHOD.
```
