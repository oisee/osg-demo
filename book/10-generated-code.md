# 10. Generated code

open-steamgate generates ABAP in layers, and every generated line keeps the
way back to what made it:

| Layer | What a person writes | What comes out | In this demo |
|---|---|---|---|
| **L0** templates | a Mustache-style template and a JSON model | text; every line traced to its template line and model path | `ZCL_OSD_FLEET_TPL` (below) |
| **L1** typed model | nothing by hand: a generator fills it | ABAP from recipes; lines traced to model nodes (`@id`), literals typed from the DDIC (`@type`) | the lift in chapter 11 renders one recipe |
| **L2** domain rules | a rule in the domain's words (YAML) | an L1 model, then an ABAP check class and its test class | not yet; see the end of this chapter |

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

- the SEGW generator writes a whole `_MPC` class through L1 recipes, with its
  trace file (`GenerateSet` in the SEGW editor);
- `node tools/dsl-abap.mjs model <folder> --class <name>` reads a model out of
  existing ABAP (methods, parameters, types through the DDIC);
- generated regions inside hand-written ABAP, checked and rewritten by
  `node tools/dsl-regions.mjs check|write <path>`, and recipes built as units
  by `npm run dsl:build`.

Chapter 11's lift uses the same pieces by hand: `tools/lift.mjs` builds the
model out of `BEFORE`, a recipe template renders `AFTER`'s region, and
`test/lift.mjs` checks the two stay in step.

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

This demo does not have an L2 rule of its own yet; its tables would fit one
(`ZOSD_FLEET_SHIP`, `ZOSD_FLEET_VOY`). The specification is open-steamgate's
[docs/dsl-l2.md](https://github.com/oisee/open-steamgate/blob/main/docs/dsl-l2.md).
