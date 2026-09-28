# Fleet BAL contract: A4H API readout

On 2026-09-28, the A4H sandbox (ABAP 7.58 / 2022) answered read-only ADT
requests through `vsp` for the classes and interfaces below. This establishes
API presence and signatures. No BAL object was configured, no log was written,
and persistence or transaction behavior has **not** been measured yet.

| Need | A4H API observed |
| --- | --- |
| Identify a run | `CL_BALI_HEADER_SETTER=>CREATE( object, subobject, external_id )` returns `IF_BALI_HEADER_SETTER`. `external_id` has type `BALNREXT`. |
| Create a log | `CL_BALI_LOG=>CREATE_WITH_HEADER( header )` returns `IF_BALI_LOG`; both creation methods raise `CX_BALI_RUNTIME`. |
| Add a message | `CL_BALI_FREE_TEXT_SETTER=>CREATE( text, severity )` returns `IF_BALI_FREE_TEXT_SETTER`; `IF_BALI_LOG~ADD_ITEM( item )` raises `CX_BALI_RUNTIME`. The severity defaults to status. |
| Save | `CL_BALI_LOG_DB=>GET_INSTANCE( )` returns `IF_BALI_LOG_DB`. **`SAVE_LOG` belongs to that interface**, with `log`, optional `use_2nd_db_connection` and `assign_to_current_appl_job`; it raises `CX_BALI_RUNTIME`. A4H marks the `use_2nd_db_connection` parameter deprecated and provides `IF_BALI_LOG_DB~SAVE_LOG_2ND_DB_CONNECTION` instead. Neither transaction behavior has been measured. |
| List runs | `CL_BALI_LOG_FILTER=>CREATE( )` returns `IF_BALI_LOG_FILTER`; `SET_DESCRIPTOR` accepts object, subobject and external ID, including wildcard matching for the latter two. `IF_BALI_LOG_DB~LOAD_LOGS_VIA_FILTER( filter, read_only_header )` returns a table of logs. |
| Open a run | `IF_BALI_LOG_DB~LOAD_LOG( handle )` loads one log. `IF_BALI_LOG~GET_HEADER( )` exposes external ID, UTC timestamp and counts by severity; `GET_ALL_ITEMS( )` exposes ordered item references. `IF_BALI_ITEM_GETTER` exposes severity, UTC timestamp and `GET_MESSAGE_TEXT( )`. |

The viewer can therefore filter by the external run ID on the database side and
by severity after loading the run's items. A header alone has severity counts,
but no individual message text. Keep the demo's viewer read-only. The fleet
object/subobject must be registered on A4H before a write probe; API presence
alone does not prove that a chosen `Z*` descriptor can be saved there.

## Smallest executable slice

Keep `ZCL_OSD_FLEET_AUDIT=>INSPECT` as the read-only calculation. The first
runtime-backed slice runs it synchronously with a freshly generated run ID in
the external-ID field (which is not a database uniqueness constraint) and
persists three items in one log: `started`, the observed ship/voyage counts,
and `finished` with success or error severity. The existing seed expects six
ships and twenty voyages. A forced mismatch (expect seven ships) supplies a
predictable error run. Two normal runs and the error run must remain separate
after an OSD process restart without clearing its database. The viewer lists
headers and opens each run's messages; a severity filter shows the error run.

The shared `open-steamgate` runtime owns the BAL implementation, durable
storage and read API ([runtime issue #189](https://github.com/oisee/open-steamgate/issues/189)).
`osg-demo` will own the fleet caller, viewer and integration assertions once
that public surface exists. The current `CL_BALI_LOG_DB` library stand-in that
remembers one log in memory does not meet this contract. Do not add a private
BAL table to the demo.

Keep the fleet caller's interface narrow: record the run ID, observed counts
and outcome. A test-only in-memory recorder may verify that caller without a
database. The shipped adapter must use the shared BAL API. A generic logger
that accepts arbitrary ABAP values, handles SAP GUI display or owns its own
storage would enlarge this slice without proving the persistence contract.

## A4H behavioral probe still needed

The A4H read-only check found no `ZOSD*` entry in `BALOBJ` or `BALSUB` on
2026-09-28. Before a write probe, register **only** log object `ZOSD_FLEET`
and subobject `AUDIT` in a disposable namespace (for example via SLG0), and
record the package/transport used. Do not write probe entries under an
unrelated existing log object. The proposed test program is a separate
throwaway A4H object; the demo pack does not deploy it.

The [standalone probe source](../probes/a4h/zosd_bal_probe.prog.abap) uses
synthetic fleet counts, so it does not require importing the demo's fleet
tables into A4H. Create `PROG ZOSD_BAL_PROBE` only in the approved sandbox
package after reviewing the source. It has not been activated or syntax-checked
on A4H yet. Use `W` with two different run IDs and severity `S`, then `W`
with a third ID and severity `E`; run `R` for each ID in separate sessions.
Use `X`, `S` and `D` with new IDs for the rollback, second-connection and
repeated-ID cases respectively, followed by `R` in fresh sessions.

Use a unique probe prefix in each external run ID and retain the returned
log handles. Run these cases from fresh sessions, loading by exact external
ID and then by handle, and compare ordered item texts and severities:

| Case | Write and observation |
| --- | --- |
| Baseline | Save two success logs and one error log, each with start, counts and finish items. `COMMIT WORK`, then reload all three from a new session. |
| Transaction | Save a new log, test visibility before an explicit commit, then compare a committed run and a `ROLLBACK WORK` run from fresh sessions. Record any implicit commit caused by the execution tool. |
| Repeated ID | Save two logs with the same external ID. Record both handles and whether the filter returns both; do not infer uniqueness from the field name. |
| Second connection | Repeat the rollback case with `SAVE_LOG_2ND_DB_CONNECTION`, the A4H method that replaces the deprecated `use_2nd_db_connection` flag. Record whether its log remains readable after the caller rolls back. |

This is a behavioral experiment, so none of the transaction or duplicate-ID
outcomes is asserted in advance. The probe writes SAP application logs and
customizing; no such write has been run yet. Database-writing ABAP Unit tests
belong at `RISK LEVEL DANGEROUS`; the current audit tests remain harmless
because they only read fleet rows.

Background-job event delivery and the optional doctor daemon are separate
gates after this BAL slice. The [job API readout](fleet-operations-trace.md#a4h-job-api-readout-2026-09-28)
confirms only availability and signatures; it does not establish their A4H
behavior or OSD compatibility.
