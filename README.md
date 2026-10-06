# The Airship Fleet: an open-steamgate demo

ABAP running locally in VS Code, with no SAP system and no ADT connection. One small application, six airships and twenty voyages, shows the whole path: from a first class through OData, Fiori, CDS and AMDP to business logs, background jobs, generated code and a lifted legacy routine.

This folder is an abapGit repository and an [open-steamgate](https://github.com/oisee/open-steamgate) workspace pack. The extension carries a whole local ABAP system; this repository adds its own objects on top of it.

**Read it as a book**, in English ([book/](book/00-preface.md)) or in Russian ([book/ru/](book/ru/00-preface.md), «Флот дирижаблей»): chapter by chapter below, or as PDF and EPUB built with [`book/build.sh`](book/build.sh).

## Quick start

1. Install the **open-steamgate** extension, **0.6.1650 or later** (`oisee.open-steamgate`, pre-release): search for it in the Extensions view, or take the `.vsix` from the latest [`vscode-v*` release](https://github.com/oisee/open-steamgate/releases) and run **Extensions: Install from VSIX...**.
2. Clone this repository and open the clone as a VS Code folder.
3. Run **osd: Start (build + run this system)**. The bundled system starts, and this folder is layered on top as a pack in package `$ZOSD_DEMO`. It shows up under **Workspace layers** in the Testing view.
4. Open [ZOSD_DEMO_HELLO](src/zosd_demo_hello.clas.abap) and press **F9**. Expected: `Hello from ZOSD_DEMO_HELLO.` in the **osd console**. Chapter 1 goes on from there.

From an open-steamgate checkout the same pack runs in a terminal: `OSD_PACKS=/path/to/osg-demo STG_PORT=8099 npm start`.

## The book

| # | Chapter | RU | You will see | Main objects |
|---|---|---|---|---|
| | [Preface](book/00-preface.md) | [Предисловие](book/ru/00-preface.md) | the fleet, setup, keys | |
| 1 | [Hello](book/01-hello.md) | [Hello](book/ru/01-hello.md) | a classrun, a green unit test, edit and activate | `ZOSD_DEMO_HELLO` |
| 2 | [Debug, tests, and dumps](book/02-debug-tests-dumps.md) | [Отладка](book/ru/02-debug-tests-dumps.md) | a breakpoint, a red test, a short dump, a classic ALV grid | `ZCL_OSD_FLEET_REPORT`, `ZOSD_FLEET_ALV` |
| 3 | [The OData ladder](book/03-odata.md) | [OData](book/ru/03-odata.md) | `$metadata`, `$filter`, a MERGE, navigation, value help | `ZOSD_FLEET_SRV` |
| 4 | [Fiori apps](book/04-fiori.md) | [Fiori](book/ru/04-fiori.md) | a launchpad tile, list report and object page | app `ZOSG_DEMO` |
| 5 | [The CDS cube](book/05-cds.md) | [CDS](book/ru/05-cds.md) | voyages by ship and month | `ZC_OSD_FLEETCUBE` |
| 6 | [AMDP on the fleet](book/06-amdp.md) | [AMDP](book/ru/06-amdp.md) | SQLScript on DuckDB and HANA, checked against Open SQL | `ZCL_OSD_FLEET_FUEL`, `ZCL_OSD_FLEET_SUMMARY` |
| 7 | [Take it to a system](book/07-take-to-system.md) | [Перенос](book/ru/07-take-to-system.md) | an abapGit zip of exactly what may travel | [deploy/manifest.json](deploy/manifest.json) |
| 8 | [The business log](book/08-business-log.md) | [Журнал](book/ru/08-business-log.md) | BAL logs per run, a viewer, an ALV grid of messages | `ZCL_OSD_FLEET_BAL`, `ZOSD_FLEET_BALV` |
| 9 | [Background jobs](book/09-background-jobs.md) | [Задания](book/ru/09-background-jobs.md) | a job, a chain of two, a failing chain that waits, a doctor | `ZCL_OSD_FLEET_JOB`, `ZCL_OSD_FLEET_CHAIN`, `ZCL_OSD_FLEET_DOCTOR` |
| 10 | [Generated code](book/10-generated-code.md) | [Генерация](book/ru/10-generated-code.md) | a report from a template with a trace per line; the L0/L1/L2 layers | `ZCL_OSD_FLEET_TPL` |
| 11 | [Lift a legacy routine](book/11-lift.md) | [Lift](book/ru/11-lift.md) | a SELECT in a loop rewritten from a model, proven equal | `ZCL_OSD_FLEET_LIFT` |
| 12 | [Rules, code and proof](book/12-rules.md) | [Правила](book/ru/12-rules.md) | a fleet rule in YAML compiled to ABAP, proven by its examples | `ZCL_OSD_FLEET_L2_MAINT` |
| 13 | [Where did this line come from?](book/13-trace.md) | [Трассировка](book/ru/13-trace.md) | one generated line followed back to its rule line | `*.trace.json`, `*.trace.meta.json` |
| 14 | [My ABAP escaped from the server](book/14-cli.md) | [Сбежал с сервера](book/ru/14-cli.md) | a report compiled into a native CLI and terminal form, its own SQLite file | `ZOSD_FLEET_CLI` (`cli/`) |
| 15 | [The workbench](book/15-vscode.md) | [Рабочее место](book/ru/15-vscode.md) | from a service to its code and back in VS Code: the System view, `.http` requests, a call to its HTTP answer | `http/fleet.http` |
| 16 | [Orchestration: the night set](book/16-orchestration.md) | [Оркестрация](book/ru/16-orchestration.md) | a set of rules in stages: a filter fills a worklist, piles run as jobs, a gate opens the next stage once, a nightly schedule | `ZCL_OSD_FLEET_NIGHT` (`src/l3/`) |
| 17 | [The governor](book/17-governor.md) | [Регулятор](book/ru/17-governor.md) | a budget of open alerts per run: the run stops at its glass, a person continues it with a reason | `ZCL_OSD_FLEET_WATCH` (`src/l3/`) |
| 18 | [Because we can: JavaScript and C in ABAP](book/18-c-in-abap.md) | [JavaScript и C в ABAP](book/ru/18-c-in-abap.md) | QuickJS as ABAP on a real kernel (abapiti's result); a C function via WebAssembly and abapiti into an ABAP class, drawing the Mandelbrot set like native C | `ZCL_WASM_MANDEL` (`src/iti/`, `iti/`) |
| 19 | [An agent that writes ABAP from inside the system](book/19-pia.md) | [Агент, который пишет ABAP изнутри системы](book/ru/19-pia.md) | PIA, an ABAP coding agent written in ABAP: green, break, red, fix, green on SAP A4H; the open-steamgate run follows the next PIA release | — (PIA's own repository) |
| A | [Run the checks](book/90-run-the-checks.md) | [Проверки](book/ru/90-run-the-checks.md) | the automated end-to-end checks | `test/` |
| B | [Take it to a system](docs/take-to-system.md) | [Перенос](book/ru/91-take-to-system.md) | what travels, what stays, how to import | |
| C | [Limits and glossary](book/92-limits-glossary.md) | [Ограничения](book/ru/92-limits-glossary.md) | the fine print, the terms | |

## Code that writes code

Chapters 10 and 11 use open-steamgate's generation layers, in which a generated line can keep the way back to what made it.

| Layer | You write | You get | Here |
|---|---|---|---|
| **L0** templates | a template and a JSON model | text, each line traced to template line and model path | chapter 10; chapter 11's lift renders its recipe this way |
| **L1** typed model | nothing: a generator fills it | ABAP from recipes, typed literals, a trace per line | chapter 10 (overview; the demo has no L1 generator of its own) |
| **L2** domain rules | a rule in the domain's words | a check class and its tests, traced to the rule's lines | chapters 12 and 13 |
| **L3** sets of rules | stages, piles and a schedule over L2 rules | a runner that plans, submits and gates the jobs, its job report and ports | chapter 16 |

## Check it

In an open-steamgate checkout, run `npm install && npm run bootstrap` once. Then:

```
OSD_HOME=/path/to/open-steamgate SLICE_SKIP_UI=1 node test/slice.mjs            # 22 checks, SQLite; 21 run, the UI one is skipped
OSD_HOME=/path/to/open-steamgate SLICE_SKIP_UI=1 STG_DB=duckdb node test/slice.mjs
OSD_HOME=/path/to/open-steamgate node test/jobs.mjs                             # 7 job checks
OSD_HOME=/path/to/open-steamgate node test/l3.mjs                              # chapters 16 and 17: the night set and its governor, 7 checks
OSD_HOME=/path/to/open-steamgate node test/iti.mjs                             # chapter 18: C in ABAP draws what native C draws
OSD_HOME=/path/to/open-steamgate node test/lift.mjs                             # lifted region in step
OSD_HOME=/path/to/open-steamgate node test/l2.mjs                               # the L2 rule's class in step (--write rebuilds)
node test/book-snippets.mjs                                                      # the book's code excerpts match src/
OSD_HOME=/path/to/open-steamgate node test/cli.mjs                              # build the fleet CLI (Go 1.26) and run chapter 14
OSD_HOME=/path/to/open-steamgate node test/book-shots.mjs                       # retake the book's screenshots
OSD_HOME=/path/to/open-steamgate node test/cli-shots.mjs /tmp/fleet-cli         # chapter 14's pictures, after cli.mjs --keep /tmp/fleet-cli
```

`test/vscode-shots.mjs` retakes the VS Code pictures of chapters 1, 2, 9 and 15–17; its header says what it needs (VS Code, the extension's VSIX, Xvfb).

CI runs the slice on SQLite and DuckDB (with `SLICE_SKIP_UI=1`, so the browser check is skipped) and the command line program, job, L3 and C-in-ABAP checks on every change, against the open-steamgate tag the book is written for (`book/baseline.yaml`; that result decides); the same run against open-steamgate `main` is a canary: it shows as `fleet (main)`, red when main breaks something, without failing the run ([smoke.yml](.github/workflows/smoke.yml)); slice check 16 runs the lift check and check 17 the L2 rule's. [Appendix A](book/90-run-the-checks.md) says what each covers.

## Repository map

| Where | What |
|---|---|
| `src/` | the ABAP objects, DDIC, SEGW model, CDS; `src/l2/` the L2 rule and what it builds to; `src/iti/` and `iti/` chapter 18's C in ABAP; `src/l3/` the night set and the watch set (DSL L3, chapters 16 and 17), their rules, what they build to and their classruns |
| `data/` | seed rows for the local system (not carried to a system) |
| `webapp/` | the Fiori Elements app |
| `cli/` | the fleet's command line program (chapter 14), not part of the pack |
| `http/` | the fleet service's requests as a `.http` file (chapter 15) |
| `book/`, `book/ru/` | the book in English and Russian; `book/build.sh` renders EPUB, PDF and HTML of both |
| `docs/` | the fleet contract, measurements and design notes |
| `deploy/manifest.json` | the objects allowed to travel to a system |
| `test/` | end-to-end checks against a real engine |
| `osd-pack.json` | the pack: package, layer, launchpad tile |

Releases: [v0.1](https://github.com/oisee/osg-demo/releases/tag/v0.1) and later.
