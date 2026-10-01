# 10. Generated code

open-steamgate generates ABAP in layers, and a generated line can keep the
way back to what made it:

| Layer | What a person writes | What comes out | In this demo |
|---|---|---|---|
| **L0** templates | a Mustache-style template and a JSON model | text; every line traced to its template line and model path | `ZCL_OSD_FLEET_TPL` (below); chapter 11's lift renders its recipe through it |
| **L1** typed model | nothing by hand: a generator fills it | ABAP from recipes; lines traced to model nodes (`@id`), literals typed from the DDIC (`@type`) | not yet; the lift in chapter 11 borrows its recipe idea by hand |
| **L2** domain rules | a rule in the domain's words (YAML) | an L1 model, then an ABAP check class and its test class | chapters 12 and 13 |

The rule between them: **the template renders, the model decides.**

## L0: the fleet report from a model

[ZCL_OSD_FLEET_TPL](../src/zcl_osd_fleet_tpl.clas.abap) generates the fleet
report instead of writing it by hand: it reads the ships and their status
texts into a JSON model and renders a Mustache-style template over it with
open-steamgate's template engine `ZCL_OSD_TPL`
([open-steamgate PR #266](https://github.com/oisee/open-steamgate/pull/266)).
Every output line keeps a trace to where it came from.

1. Open the class and press **F9**. Expected: `Fleet report: 6 airships`, one
   line per ship such as `S001 Albatross    Aloft       steam 82%`, and
   `End of fleet report`; then a trace, one row per output line, such as
   `2 <- fleet:3 /airships/1/id`: output line 2 came from line 3 of the
   template `fleet`, for the first airship of the model. The path is the first
   value on the line; a line without a value, like the last one, shows the
   section it is in (`/`).
2. Change the template in `TEMPLATE` (for example add `{{status}}` to line 3)
   and press **F9** again: every ship line changes, and the trace still points
   at template line 3.
3. Run the class in Testing. Its two HARMLESS tests read the seed rows and
   check a ship line and the trace of the third ship.

The class stays local because what it needs is not in this unit:
`ZCL_OSD_TPL` comes with open-steamgate (on a system it is an ordinary Z class
that would have to be imported first) and `ZCL_AJSON` is the ajson library,
which a system may or may not have.

## L1: the typed generation model

L1 is the model a generator fills and a recipe renders. Two additions over
plain JSON make it typed: every node a template reads carries a stable `@id`
(`entity/Travel/property/TravelId`), and a value that stems from the DDIC
carries `@type` (built-in type, length, decimals), so the `literal` filter
writes `'0123'` for a NUMC 4 and refuses a value that does not fit. The trace
of a rendered file can be written beside it as `<object>.trace.json`, one entry
per output line: line, template line, model path and model node. Profiles
check the rendered text (for ABAP: line length, trailing blanks, 7-bit
identifiers) and point a violation at the template line that caused it.

Where you meet it in open-steamgate (not in this demo's code):

- the SEGW generator writes a whole `_MPC` class through L1 templates, with its
  trace file (`GenerateSet` in the SEGW editor);
- `node tools/dsl-abap.mjs model <folder> --class <name>` reads a model out of
  existing ABAP (methods, parameters, types through the DDIC);
- generated regions inside hand-written ABAP, checked and rewritten by
  `node tools/dsl-regions.mjs check|write <path>`, and recipes built as units
  by `npm run dsl:build`.

Chapter 11's lift is simpler than L1: `tools/lift.mjs` builds a plain model
(no `@id`, no `@type`) out of `BEFORE`, `ZCL_OSD_TPL` renders the recipe's
template into `AFTER`'s region, and `test/lift.mjs` checks the two stay in
step; it keeps no trace file. open-steamgate's `dsl-regions` can manage such a
region with its own `osd:gen` markers; this demo keeps its `lift:R1` markers.

The specification is open-steamgate's
[docs/dsl-l1.md](https://github.com/oisee/open-steamgate/blob/main/docs/dsl-l1.md).

## L2: a domain rule compiled to L1

L2 is what a person writes: a rule in the terms of a domain, one YAML file.
The compiler knows the rule language and the DDIC, nothing of the domain. Its
first example in open-steamgate reads very much like this fleet:

```yaml
rule: maintenance-ship-no-future-voyage
title: A ship in maintenance has no voyage departing after the check date
for: ZOSD_L2_SHIP as ship
when: ship.status = 'M'
forbid:
  exists: ZOSD_L2_VOY as voy
  where: voy.ship_id = ship.ship_id and voy.dep_date > $date
alert: "{ship.ship_id} {ship.name}: in maintenance, voyage {voy.voyage_id} departs {voy.dep_date}"
examples:
  - name: flagged
    date: 20261001
    rows:
      ZOSD_L2_SHIP: [{ship_id: S001, name: Albatross, status: M}]
      ZOSD_L2_VOY: [{voyage_id: V00001, ship_id: S001, dep_date: 20261005}]
    expect:
      - "S001 Albatross: in maintenance, voyage V00001 departs 20261005"
```

`node tools/dsl-l2.mjs build <rule.l2.yaml> --out <dir>` checks every name and
type against the DDIC (an error names the rule's line), compiles the rule to an
L1 model, and renders a check class `ZCL_L2_<RULE>` with `check( iv_date )` plus
a test class with one method per example. The trace goes all the way down: the
`AND dep_date > iv_date` line of the generated class points at the rule's
`where:` line. A rule must carry examples, and open-steamgate's own test flips
`>` to `>=` to prove the examples would catch it.

Slice 2 (open-steamgate #317) makes `check` one Open SQL statement, an
`INNER JOIN` of the two tables on the rule's equalities, where slice 1 read the
second table once per row of the first; the generated test class keeps the direct
form as a private `check_reference` and compares the two on every example and
derived case. With
`boundaries: auto` in the rule, the compiler also derives boundary cases from
the DDIC types of the compared fields (for the example rule: a day before, on
and after the check date; the same, another and a blank status; a matching and
a missing related row; zero and two related rows) and emits a case only if a
mutant of its own condition changes the alerts.

Chapter 12 writes such a rule for this demo's own tables, and chapter 13
follows one generated line back to it. The specification is open-steamgate's
[docs/dsl-l2.md](https://github.com/oisee/open-steamgate/blob/main/docs/dsl-l2.md).

## Under the hood

The template the fleet report is rendered from:

<!-- code: src/zcl_osd_fleet_tpl.clas.abap method template -->
```abap
METHOD template.
  DATA(lv_nl) = cl_abap_char_utilities=>newline.
  rv_template = `Fleet report: {{count}} airships` && lv_nl
    && `{{#airships}}` && lv_nl
    && `{{id}} {{name | pad 12}} {{status_text | pad 11}} steam {{steam_pct}}%` && lv_nl
    && `{{/airships}}` && lv_nl
    && `End of fleet report`.
ENDMETHOD.
```

The model it is rendered over, built from the fleet tables:

<!-- code: src/zcl_osd_fleet_tpl.clas.abap method model -->
```abap
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
```
