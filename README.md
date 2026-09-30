# The Airship Fleet: an open-steamgate demo

ABAP running locally in VS Code, with no SAP system and no ADT connection. One small application, six airships and twenty voyages, shows the whole path: from a first class through OData, Fiori, CDS and AMDP to business logs, background jobs, generated code and a lifted legacy routine.

This folder is an abapGit repository and an [open-steamgate](https://github.com/oisee/open-steamgate) workspace pack. The extension carries a whole local ABAP system; this repository adds its own objects on top of it.

**Read it as a book:** [book/](book/00-preface.md), chapter by chapter below, or as a PDF or EPUB built with [`book/build.sh`](book/build.sh).

## Quick start

1. Install the **open-steamgate** extension (`oisee.open-steamgate`, pre-release): search for it in the Extensions view, or take the `.vsix` from the latest [`vscode-v*` release](https://github.com/oisee/open-steamgate/releases) and run **Extensions: Install from VSIX...**.
2. Clone this repository and open the clone as a VS Code folder.
3. Run **osd: Start (build + run this system)**. The bundled system starts, and this folder is layered on top as a pack in package `$ZOSD_DEMO`. It shows up under **Workspace layers** in the Testing view.
4. Open [ZOSD_DEMO_HELLO](src/zosd_demo_hello.clas.abap) and press **F9**. Expected: `Hello from ZOSD_DEMO_HELLO.` in the **osd console**. Chapter 1 goes on from there.

From an open-steamgate checkout the same pack runs in a terminal: `OSD_PACKS=/path/to/osg-demo STG_PORT=8099 npm start`.

## The book

| # | Chapter | You will see | Main objects |
|---|---|---|---|
| | [Preface](book/00-preface.md) | the fleet, setup, keys | |
| 1 | [Hello](book/01-hello.md) | a classrun, a green unit test, edit and activate | `ZOSD_DEMO_HELLO` |
| 2 | [Debug, tests, and dumps](book/02-debug-tests-dumps.md) | a breakpoint, a red test, a short dump, a classic ALV grid | `ZCL_OSD_FLEET_REPORT`, `ZOSD_FLEET_ALV` |
| 3 | [The OData ladder](book/03-odata.md) | `$metadata`, `$filter`, a MERGE, navigation, value help | `ZOSD_FLEET_SRV` |
| 4 | [Fiori apps](book/04-fiori.md) | a launchpad tile, list report and object page | app `ZOSG_DEMO` |
| 5 | [The CDS cube](book/05-cds.md) | voyages by ship and month | `ZC_OSD_FLEETCUBE` |
| 6 | [AMDP on the fleet](book/06-amdp.md) | SQLScript on DuckDB and HANA, checked against Open SQL | `ZCL_OSD_FLEET_FUEL`, `ZCL_OSD_FLEET_SUMMARY` |
| 7 | [Take it to a system](book/07-take-to-system.md) | an abapGit zip of exactly what may travel | [deploy/manifest.json](deploy/manifest.json) |
| 8 | [The business log](book/08-business-log.md) | BAL logs per run, a viewer, an ALV grid of messages | `ZCL_OSD_FLEET_BAL`, `ZOSD_FLEET_BALV` |
| 9 | [Background jobs](book/09-background-jobs.md) | a job, a chain of two, a failing chain that waits, a doctor | `ZCL_OSD_FLEET_JOB`, `ZCL_OSD_FLEET_CHAIN`, `ZCL_OSD_FLEET_DOCTOR` |
| 10 | [Generated code](book/10-generated-code.md) | a report from a template with a trace per line; the L0/L1/L2 layers | `ZCL_OSD_FLEET_TPL` |
| 11 | [Lift a legacy routine](book/11-lift.md) | a SELECT in a loop rewritten from a model, proven equal | `ZCL_OSD_FLEET_LIFT` |
| A | [Run the checks](book/90-run-the-checks.md) | the automated end-to-end checks | `test/` |
| B | [Take it to a system](docs/take-to-system.md) | what travels, what stays, how to import | |
| C | [Limits and glossary](book/92-limits-glossary.md) | the fine print, the terms | |

## Code that writes code

Chapters 10 and 11 use open-steamgate's generation layers. Every generated line keeps the way back to what made it.

| Layer | You write | You get | Here |
|---|---|---|---|
| **L0** templates | a template and a JSON model | text, each line traced to template line and model path | chapter 10 |
| **L1** typed model | nothing: a generator fills it | ABAP from recipes, typed literals, a trace per line | chapter 11 (the lift), chapter 10 (overview) |
| **L2** domain rules | a rule in the domain's words | a check class and its tests, traced to the rule's lines | chapter 10 (overview; no rule of its own yet) |

## Check it

In an open-steamgate checkout, run `npm install && npm run bootstrap` once. Then:

```
OSD_HOME=/path/to/open-steamgate SLICE_SKIP_UI=1 node test/slice.mjs            # 21 checks, SQLite (UI skipped)
OSD_HOME=/path/to/open-steamgate SLICE_SKIP_UI=1 STG_DB=duckdb node test/slice.mjs
OSD_HOME=/path/to/open-steamgate node test/jobs.mjs                             # 7 job checks
OSD_HOME=/path/to/open-steamgate node test/lift.mjs                             # lifted region in step
```

CI runs the slice on SQLite and DuckDB and the job checks against open-steamgate `main` on every change ([smoke.yml](.github/workflows/smoke.yml)); slice check 16 runs the lift check. [Appendix A](book/90-run-the-checks.md) says what each covers.

## Repository map

| Where | What |
|---|---|
| `src/` | the ABAP objects, DDIC, SEGW model, CDS |
| `data/` | seed rows for the local system (not carried to a system) |
| `webapp/` | the Fiori Elements app |
| `book/` | the book; `book/build.sh` renders EPUB, PDF and HTML |
| `docs/` | the fleet contract, measurements and design notes |
| `deploy/manifest.json` | the objects allowed to travel to a system |
| `test/` | end-to-end checks against a real engine |
| `osd-pack.json` | the pack: package, layer, launchpad tile |

Releases: [v0.1](https://github.com/oisee/osg-demo/releases/tag/v0.1) and later.
