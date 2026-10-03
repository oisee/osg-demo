# 13. Where did this line come from?

Every line the L2 compiler writes knows where it came from: the template line
that printed it, the model node it was printed for, and the line of the rule
that node stands for. The build records this beside the class as
`zcl_osd_fleet_l2_maint.clas.trace.json`, one entry per generated line.

## Follow one line

Take the condition that makes the rule a date rule, line 32 of the check
class:

```abap
AND voy~dep_date > iv_date
```

Its entry in the trace file:

<!-- code: src/l2/zcl_osd_fleet_l2_maint.clas.trace.json lines 224-230 -->
```json
{
 "line": 32,
 "template_line": 189,
 "path": "/queries/1/where/2/pre",
 "node": "rule/maintenance-ship-no-voyage/forbid/where/2",
 "rule_line": 14
},
```

- `template_line` is the line of open-steamgate's
  `recipes/l2-check/template.tpl` that prints a `WHERE` condition; the
  number moves with that template, so your checkout may show another one;
- `path` is where in the L1 model the value came from: the second condition
  of the first query;
- `node` is the model node: the second comparison of the rule's `forbid` /
  `where`;
- `rule_line` 14 is the line of the rule you wrote:
  `where: voy.ship_id = ship.ship_id and voy.dep_date > $date`.

The other lines read the same way: `INNER JOIN zosd_fleet_voy AS voy` comes
from `forbid` (rule line 12), `ON voy~ship_id = ship~ship_id` from the first
`where` comparison (line 14), `WHERE ship~status = 'M'` from `when` (line 11).
The test class has its own trace: each example's method points at its
example, and each derived `B_...` method at the rule condition it tests.

## Why it matters

A reviewer who sees a line in the generated code goes to the rule line that
made it in one lookup, and a line that changes after a rebuild names the rule
line that changed it. The trace file also records the template (by its path)
and the model (by a hash) that produced the class. A changed model shows in
the hash; a changed template does not, so `test/l2.mjs` rebuilds and compares
the files, and that is what catches it.

To read the whole file:
`node -e "for (const e of require('./src/l2/zcl_osd_fleet_l2_maint.clas.trace.json').lines) console.log(e.line, e.rule_line, e.node)"`.
