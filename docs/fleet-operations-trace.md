# Fleet operations trace (proposed chapter)

This is a small operational scenario for the Airship fleet, not a claim of
general SAP `SUBMIT`, spool, or background-job compatibility. It uses the
existing six ships and twenty voyages. Chapter 2 already demonstrates the
classic ALV report independently.

## First slice: business log and viewer

Run a fleet audit synchronously. Give each run an ID. Record the start,
ship and voyage counts, a validation outcome, and the finish or failure as
business-log messages with severity and time. Show the log in a read-only
viewer that can filter by run ID and severity and open the messages for a run.
Two runs must remain distinct. A failed audit must show its error, and saved
messages must still be visible after restarting the local system.

The implementation belongs in open-steamgate's shared logging/runtime layer.
The demo supplies the fleet audit and assertions against the public API. Do
not implement a private log database or a UI-only imitation in this pack.
Validate the chosen BAL calls and persistence behavior on A4H before naming
them SAP-compatible. The currently available `CL_BALI_LOG_DB` library stand-in
only remembers the last log in memory; it does not satisfy this slice.

## Next slice: connected jobs

Schedule two short chains over the same fleet:

1. **Voyage chain:** inspect voyage rows, calculate counts per ship, then
   publish a tail event only after successful completion.
2. **Readiness chain:** wait for that event, inspect ship status and the
   voyage summary, then write a final business-log result.

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

The job and daemon gates are future work. The current open-steamgate runtime
does not provide the required persistent business log, job scheduler, or
daemon lifecycle as a complete public interface.
