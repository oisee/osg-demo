# 12. Rules, code and proof

Chapter 10 ended with L2: a rule written in the words of the domain, compiled
to an L1 model and rendered to ABAP. This chapter writes one for the fleet and
lets the compiler do the rest.

## The rule

A ship in maintenance should not have a voyage departing after a given date.
In L2 that is one YAML file,
[maintenance_no_voyage.l2.yaml](../src/l2/maintenance_no_voyage.l2.yaml):

<!-- code: src/l2/maintenance_no_voyage.l2.yaml lines 8-16 -->
```yaml
class: zcl_osd_fleet_l2_maint
title: A ship in maintenance has no voyage departing after the check date
for: ZOSD_FLEET_SHIP as ship
when: ship.status = 'M'
forbid:
  exists: ZOSD_FLEET_VOY as voy
  where: voy.ship_id = ship.ship_id and voy.dep_date > $date
alert: "{ship.ship_id} {ship.name}: in maintenance, voyage {voy.voyage_id} departs {voy.dep_date}"
boundaries: auto
```

`for` names the table a violation is about, `when` narrows it, `forbid` names
what must not exist for such a row, and `alert` is the line each violation
prints, with holes for fields. The rest of the file is examples: rows to insert,
a check date, and the alerts expected. A rule without examples does not build.

The examples use ships `X001` to `X003` and dates in 2027. The seed rows of the
earlier chapters (`S004 Cumulus` is in maintenance and has voyages) never meet
them: their voyages depart in 2026.

## Build it

In an open-steamgate checkout:

```
node tools/dsl-l2.mjs build /path/to/osg-demo/src/l2/maintenance_no_voyage.l2.yaml \
  --out /path/to/osg-demo/src/l2 \
  --ddic /path/to/osg-demo/src/ddic --ddic .local/lars/open-abap-core/src
```

The compiler checks every table, field and literal against the DDIC; a mistake
names the rule's file and line (an example name that would make a method name
longer than 30 characters is refused the same way). It writes the check class
`ZCL_OSD_FLEET_L2_MAINT`, its test class, and a trace file beside each.

## The generated check

<!-- code: src/l2/zcl_osd_fleet_l2_maint.clas.abap method check -->
```abap
METHOD check.
  " one query: the tables joined, never a SELECT per row of the first
  TYPES: BEGIN OF ty_join,
           ship_ship_id TYPE zosd_fleet_ship-ship_id,
           voy_voyage_id TYPE zosd_fleet_voy-voyage_id,
           ship_name TYPE zosd_fleet_ship-name,
           voy_dep_date TYPE zosd_fleet_voy-dep_date,
         END OF ty_join.
  DATA lt_join TYPE STANDARD TABLE OF ty_join WITH DEFAULT KEY.
  DATA ls_join TYPE ty_join.
  DATA lv_alert TYPE string.
  SELECT
      ship~ship_id AS ship_ship_id
      voy~voyage_id AS voy_voyage_id
      ship~name AS ship_name
      voy~dep_date AS voy_dep_date
    FROM zosd_fleet_ship AS ship
      INNER JOIN zosd_fleet_voy AS voy
        ON voy~ship_id = ship~ship_id
    INTO CORRESPONDING FIELDS OF TABLE lt_join
    WHERE ship~status = 'M'
      AND voy~dep_date > iv_date
    ORDER BY
      ship~ship_id
      voy~voyage_id.
  LOOP AT lt_join INTO ls_join.
    lv_alert = ls_join-ship_ship_id
      && ` `
      && ls_join-ship_name
      && `: in maintenance, voyage `
      && ls_join-voy_voyage_id
      && ` departs `
      && ls_join-voy_dep_date.
    APPEND lv_alert TO rt_alerts.
  ENDLOOP.
ENDMETHOD.
```

One Open SQL statement: the two tables joined on the rule's equality, the
rule's conditions in the `WHERE`, one condition per line. Nothing in it is
written by hand.

## The proof

The test class has one method per example, and, because the rule says
`boundaries: auto`, one per boundary case the compiler derived from the DDIC
types: a check date one day before, on and after a departure (`B_DEP_DATE_LT`,
`_EQ`, `_GT`), the same, another and a blank status, a matching and a missing
ship, and zero and two voyages. A case is kept only if mutating its own
condition changes the alerts. Each method inserts its rows into the
fleet tables, calls `check` and a reference form (the same rule as a person
would write it: a `SELECT` per ship), asserts that both answer alike and that
the answer is the example's `expect`, and deletes its rows again. The class is
`RISK LEVEL DANGEROUS`, because it writes to the rule's own tables.

1. Run `ZCL_OSD_FLEET_L2_MAINT` in Testing. Expected: fifteen green
   methods, the five examples (`FLAGGED`, `AN_EARLIER_VOYAGE`,
   `DEPARTS_ON_THE_CHECK_DATE`, `A_SHIP_ALOFT_IS_FINE`,
   `ONE_ALERT_PER_VOYAGE`) and the ten `B_...` boundary cases.
2. Break the rule on purpose: change `voy.dep_date > $date` to
   `voy.dep_date >= $date` and build again. Expected: the build refuses
   before it writes anything, because the compiler runs the examples itself:
   `maintenance_no_voyage.l2.yaml:36: example "departs on the check date"
   expects [] but the rule gives ["X001 Zephyr: in maintenance, voyage X00003
   departs 20270301"]`. The example on the check date is the boundary that
   catches the mistake. Put `>` back.
3. `node tools/dsl-l2.mjs check <rule> --out <dir> ...` (same flags as build)
   regenerates into a scratch folder and compares byte for byte; it exits 1
   when the committed class no longer matches its rule.

The class travels like any other class; the rule file and the traces are
files of this repository and do not.
