# Fleet operations trace (proposed chapter)

This is a small operational scenario for the Airship fleet, not a claim of
general SAP `SUBMIT`, spool, or background-job compatibility. It uses the
existing six ships and twenty voyages. Chapter 2 already demonstrates the
classic ALV report independently.

## First slice: business log and viewer

`ZCL_OSD_FLEET_AUDIT` provides the read-only count and success/error result.
`ZCL_OSD_FLEET_BAL` now records two successful audits and one forced error
through `CL_BALI_*`; `ZCL_OSD_FLEET_BAL_VIEW` reads the persisted messages.
This branch requires the BAL subset merged from
[open-steamgate PR #207](https://github.com/oisee/open-steamgate/pull/207).

Run a fleet audit synchronously. Give each run an ID. Record the start,
ship and voyage counts, a validation outcome, and the finish or failure as
business-log messages with severity and UTC timestamps. The read-only class
viewer can filter by exact run ID or severity and shows each run's messages.
Two runs must remain distinct. A failed audit must show its error, and saved
messages must still be visible after restarting the local system.

The implementation belongs in open-steamgate's shared logging/runtime layer.
The demo supplies the fleet audit, read-only view and assertions against that
API. The [A4H BAL probe](a4h-bal-probe.md) measured ordinary save, rollback,
reload, repeated external IDs and second-connection behavior. PR #207 covers
the ordinary caller transaction path; second-connection save and wildcard
filters are not part of that first runtime subset.

## Next slice: connected jobs

Schedule two short chains over the same fleet:

1. **Voyage chain:** inspect voyage rows, calculate counts per ship, then
   publish a tail event only after successful completion.
2. **Readiness chain:** wait for that event, inspect ship status and the
   voyage summary, then write a final business-log result.

For the first job experiment, use one run ID as the event parameter and log
external ID for both chains. Give the voyage work one short step and the
readiness work one short step. The voyage step records the twenty-row count
and emits the success event after that result is durable. The readiness step
records the six-ship count and final outcome. A forced voyage-count mismatch
must leave readiness waiting. The scheduler or a durable run record, not the
event alone, must prevent a replay from producing a second final result.

Every step has a run ID, chain ID, state, start and finish time, and a link
to its business log. A failed voyage step leaves the readiness chain waiting;
it does not publish a success event. Replaying a tail event cannot produce
duplicate final results. Keep a short output list if useful, labelled as
demo output rather than SAP spool.

An optional doctor daemon observes a stalled or failed chain and writes a
diagnostic business-log entry. Its callback stays bounded and delegates any
retry to the job scheduler; it does not run a report or wait inside the
callback. Its lifecycle, event delivery, retry and generation-change rules
need an open-steamgate contract and real-system probes before this part is
implemented.

## Gates before calling the scenario complete

- A clean start runs the audit and shows the expected counts: six ships and
  twenty voyages. The log remains readable after restart.
- Both chains show their states and linked logs. The readiness chain starts
  only after the voyage tail event. A deliberately failed voyage step blocks
  that event and leaves an actionable log.
- Replayed events and a process restart do not duplicate a final result.
  The doctor records a stalled chain once and a later recovery separately.
- Run the same contract on the local runtime and probe the corresponding
  BAL, job-event and daemon behavior on A4H. Record any semantic difference
  as an open-steamgate issue rather than masking it in the demo.

The fleet job and daemon gates are future work. PR #207 provides the first
persistent BAL subset. The runtime has narrow job, event and doctor APIs,
but this two-chain fleet scenario has not been built or validated against them.
It has a [persisted one-shot batch runner](https://github.com/oisee/open-steamgate/pull/201)
for supported converted reports and a [durable queue with one BGR worker](https://github.com/oisee/open-steamgate/pull/202).
These save runs and output across process restarts; they do not yet provide
the schedule and event contracts this scenario needs.

### A4H job API readout, 2026-09-28

Read-only ADT requests to the A4H sandbox found `JOB_OPEN`, `JOB_SUBMIT`,
`JOB_CLOSE` and `BP_EVENT_RAISE` in function group `SBTI`. `JOB_OPEN` takes a
job name and returns a job count. `JOB_CLOSE` accepts that pair plus
`event_id` and `event_param`, and returns `job_was_released`.
`BP_EVENT_RAISE` accepts `eventid` and optional `eventparm` and declares
exceptions including `eventid_does_not_exist`. The modern `CL_APJ_RT_API`
also exists, but no job has been scheduled through either API for this demo.
This readout proves availability and signatures only: event registration,
step submission, release, commit, delivery, replay and failure behavior still
need an A4H probe. It does not justify implementing those behaviors inside
`osg-demo` ahead of a shared runtime contract.
