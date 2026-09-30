# Appendix C. Limits and glossary

## What this demo does not promise

- **Local system, real semantics where measured.** open-steamgate runs ABAP
  transpiled to JavaScript. Where a behaviour was measured on a real system
  (A4H), the book says so; where it was not, the book says that too.
- **Background jobs** run only with `STG_DB=file` (SQLite in a file), and a
  worker is a separate process (`node tools/osd-batch-runs.mjs worker`).
- **Scheduling, not exactly-once.** A restart or a replayed event does not
  start a job twice, but a crash after a step's business commit and before
  its result is recorded leaves the job `RUNNING` for an operator.
- **The job chain** follows SAP's documented event pattern but is measured on
  open-steamgate only.
- **Local-only objects** stay out of the abapGit zip: `ZCL_OSD_FLEET_TRAN` and
  transaction `ZOSD_FLEET` (engine interface), `ZCL_OSD_FLEET_TPL` (needs
  `ZCL_OSD_TPL` and `ZCL_AJSON`), `ZCL_OSD_FLEET_DOCTOR` (engine job doctor).
- **Seed rows do not travel.** A system gets empty tables.
- **UI5** loads from `ui5.sap.com`; the browser needs to reach it.
- **The business-log grid** is a demo view of the fleet's log, not SLG1.

## Glossary

| Term | Meaning here |
|---|---|
| OSD | open-steamgate: the local ABAP system in VS Code |
| pack | a folder with `osd-pack.json` layered on top of the system; this repository is one |
| classrun | a class's `IF_OO_ADT_CLASSRUN~MAIN`, run with F9 |
| WEBGUI | the local SAP GUI for HTML; `ZGUI_<report>` runs a converted classic report |
| BAL | the application log (`CL_BALI_*`), object `ZOSD_FLEET`, subobject `AUDIT` |
| run ID | a UUID a job or audit writes as the BAL log's external ID; it links jobs and logs |
| worker | the process that runs queued job steps (`tools/osd-batch-runs.mjs`) |
| job doctor | open-steamgate's `ZCL_OSD_JOB_DOCTOR`: a job's state, wait, steps and technical log |
| L0 / L1 / L2 | template text / typed generation model / domain rules (chapter 10) |
| trace | per generated line: template line, model path, model node, rule line |
| lift | rewriting a known code shape into a better one from a model, with its obligations |
| recipe | a template plus how its model is built (`recipes/` in open-steamgate) |
| A4H | the SAP developer system used for measurements |
