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
| Save | `CL_BALI_LOG_DB=>GET_INSTANCE( )` returns `IF_BALI_LOG_DB`. **`SAVE_LOG` belongs to that interface**, with `log`, optional `use_2nd_db_connection` and `assign_to_current_appl_job`; it raises `CX_BALI_RUNTIME`. |
| List runs | `CL_BALI_LOG_FILTER=>CREATE( )` returns `IF_BALI_LOG_FILTER`; `SET_DESCRIPTOR` accepts object, subobject and external ID, including wildcard matching for the latter two. `IF_BALI_LOG_DB~LOAD_LOGS_VIA_FILTER( filter, read_only_header )` returns a table of logs. |
| Open a run | `IF_BALI_LOG_DB~LOAD_LOG( handle )` loads one log. `IF_BALI_LOG~GET_HEADER( )` exposes external ID, UTC timestamp and counts by severity; `GET_ALL_ITEMS( )` exposes ordered item references. `IF_BALI_ITEM_GETTER` exposes severity, UTC timestamp and `GET_MESSAGE_TEXT( )`. |

The viewer can therefore filter by the external run ID on the database side and
by severity after loading the run's items. A header alone has severity counts,
but no individual message text. Keep the demo's viewer read-only. The fleet
object/subobject must be registered on A4H before a write probe; API presence
alone does not prove that a chosen `Z*` descriptor can be saved there.

## Smallest executable slice

Keep `ZCL_OSD_FLEET_AUDIT=>INSPECT` as the read-only calculation. The first
runtime-backed slice runs it synchronously with a unique external run ID and
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

## A4H behavioral probe still needed

In a disposable, authorized A4H namespace: register a fleet log
object/subobject, save two distinct run IDs and one error run, commit as the
real caller would, then load by filter and by handle from a fresh session.
Record whether save requires an explicit `COMMIT WORK`, how a rollback affects
the saved log, duplicate external IDs, message order/severity, and whether
`use_2nd_db_connection` changes the transaction boundary. This probe writes
SAP application logs and customizing, so it has not been run as part of the
read-only API check. A persistent-log ABAP Unit test must not be declared
`RISK LEVEL HARMLESS`; the current audit tests remain harmless because they
only read fleet rows.

Background-job event delivery and the optional doctor daemon are separate
gates after this BAL slice. The [job API readout](fleet-operations-trace.md#a4h-job-api-readout-2026-09-28)
confirms only availability and signatures; it does not establish their A4H
behavior or OSD compatibility.
