# 13. Where did this line come from?

The L2 compiler records each generated line's origin beside the class. In
trace format v1, `zcl_osd_fleet_l2_maint.clas.trace.json` has
`"format": "osd-trace/1"` and an `outputs` array. Each output names its ABAP
file and has `lines`: records for one `line`, or an inclusive `lines` range.
The file and output line are the key for looking up provenance.

Physical template and rule line numbers, compiled model paths and hashes
live separately in `zcl_osd_fleet_l2_maint.clas.trace.meta.json`, with
`"format": "osd-trace-meta/1"`. This book commits both companions: it uses
the metadata to navigate to the template, and L3 keeps rule-version hashes
for alert history.

## Follow one line

Take the condition that makes the rule a date rule, line 32 of the check
class:

<!-- code: src/l2/zcl_osd_fleet_l2_maint.clas.abap lines 32-32 -->
```abap
AND voy~dep_date > iv_date
```

Its stable record in the trace file:

<!-- code: src/l2/zcl_osd_fleet_l2_maint.clas.trace.json lines 286-299 -->
```json
{
  "line": 32,
  "sources": [
    {"file": "src/l2/maintenance_no_voyage.l2.yaml", "node": "rule/maintenance-ship-no-voyage/forbid/where/2", "selector": "/"},
    {"file": "src/l2/maintenance_no_voyage.l2.yaml", "node": "rule/maintenance-ship-no-voyage/forbid/where/2", "selector": "/is_cmp"},
    {"file": "src/l2/maintenance_no_voyage.l2.yaml", "node": "rule/maintenance-ship-no-voyage/forbid/where/2", "selector": "/lhs"},
    {"file": "src/l2/maintenance_no_voyage.l2.yaml", "node": "rule/maintenance-ship-no-voyage/forbid/where/2", "selector": "/op"},
    {"file": "src/l2/maintenance_no_voyage.l2.yaml", "node": "rule/maintenance-ship-no-voyage/forbid/where/2", "selector": "/pre"},
    {"file": "src/l2/maintenance_no_voyage.l2.yaml", "node": "rule/maintenance-ship-no-voyage/forbid/where/2", "selector": "/sref"}
  ],
  "locations": [
    {"recipe": "recipes/l2-check/template.tpl", "anchor": "<partial>", "offset": 0}
  ]
},
```

- `sources` names the rule file, the node
  `rule/maintenance-ship-no-voyage/forbid/where/2`, and selectors relative to
  that node. This is the second comparison in the rule's `forbid` / `where`.
- `locations` names the recipe and an anchor within it. `<partial>` is the
  coarse anchor this generator uses in v1; `offset` counts emitted lines
  within that source node's invocation, starting at zero. It is not a
  physical template line number.

The end of that line's metadata record supplies the physical lookup:

<!-- code: src/l2/zcl_osd_fleet_l2_maint.clas.trace.meta.json lines 924-930 -->
```json
"file": "zcl_osd_fleet_l2_maint.clas.abap",
"line": 32,
"node": "rule/maintenance-ship-no-voyage/forbid/where/2",
"path": "/queries/1/where/2/pre",
"rule_line": 14,
"template": "main",
"template_line": 189
```

- `template_line` 189 is the line of open-steamgate's
  `recipes/l2-check/template.tpl` that prints the condition; it moves with
  the template.
- `path` is the compiled L1 model path: the second condition of the first
  query.
- `rule_line` 14 is the line you wrote:
  `where: voy.ship_id = ship.ship_id and voy.dep_date > $date`.

The other lines read the same way: `INNER JOIN zosd_fleet_voy AS voy` comes
from `forbid` (rule line 12), `ON voy~ship_id = ship~ship_id` from the first
`where` comparison (line 14), `WHERE ship~status = 'M'` from `when` (line 11).
The test class has its own trace and metadata: each example's method points
at its example, and each derived `B_...` method at its rule condition.

## Why it matters

A reviewer can follow an output file and line to the rule node that made it.
Stable provenance keeps physical lines and hashes out of the trace, so moving
an unrelated template partial need not change that trace when the output
stays the same. With coarse `<partial>` anchors, v1 does not promise stability
inside a touched contributing partial; named anchors are a later phase.

Metadata records the output's SHA-256 hash for pairing, the model hash, and
template content hashes. Before using physical navigation, check that the
output hash matches the ABAP file; stale metadata cannot safely navigate it.
`test/l2.mjs` rebuilds and compares generated files, checks both formats and
hash pairing, and verifies the date condition's origin. Slice check 17 also
runs the generated ABAP Unit tests.

To read the stable records:
`node -e "for (const o of require('./src/l2/zcl_osd_fleet_l2_maint.clas.trace.json').outputs) for (const e of o.lines) console.log(o.file, e.line ?? e.lines, e.sources)"`.

The contract is open-steamgate's
[trace format v1](https://github.com/oisee/open-steamgate/blob/vscode-v0.6.1621/docs/trace-format.md).
