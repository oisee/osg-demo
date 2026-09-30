# Preface

This book walks a small ABAP application from its first class to background
jobs, generated code and a lifted legacy routine, on a local ABAP system that
runs inside VS Code: open-steamgate. No SAP system and no ADT connection are
needed. Every chapter says what to do, what you should see, and where the
local system differs from a real one.

## The fleet

All chapters share one small domain: six airships, twenty voyages and three
statuses.

| Table | Rows | Key | What it holds |
|---|---|---|---|
| `ZOSD_FLEET_SHIP` | 6 | `SHIP_ID` | name, status, steam in percent, home port |
| `ZOSD_FLEET_VOY` | 20 | `VOYAGE_ID` | ship, ports, dates, passengers, fuel, distance |
| `ZOSD_FLEET_STAT` | 3 | `STATUS` | `A` Aloft, `D` Docked, `M` Maintenance |

`S006 Old Boiler` has no voyages, which several chapters use on purpose. The
[fleet contract](../docs/fleet-contract.md) fixes names and shapes.

## This edition

Written against open-steamgate 0.4.0 (`main` at 17ac360b, before the tag):
`BP_JOB_SELECT` with SAP's `BTCSELECT` fields, F9 and Ctrl+Shift+F10 as
described, and the DSL layers up to L2 slice 2. **This demo needs
open-steamgate 0.4 or later.** On the extension 0.3.1370 the pack does not
build: `ZCL_OSD_FLEET_DOCTOR` uses the SAP field names `PRELIM` and `SCHEDUL`,
which 0.3.1370 does not have. The notes on 0.3.1370 in chapters 1 and 2 are
for readers who meet its key behaviour elsewhere.

## Before you start

1. Install the **open-steamgate** extension (`oisee.open-steamgate`,
   pre-release): search for it in the Extensions view, or take the `.vsix`
   from the latest
   [`vscode-v*` release](https://github.com/oisee/open-steamgate/releases)
   (0.4 or later) and
   run **Extensions: Install from VSIX...**.
2. Clone [oisee/osg-demo](https://github.com/oisee/osg-demo) and open the
   clone as a VS Code folder.
3. Run **osd: Start (build + run this system)**. The bundled system starts,
   and this folder is layered on top as a pack in package `$ZOSD_DEMO`: its
   classes, tables, seed rows and app. It shows up under **Workspace layers**
   in the Testing view.

To add this folder to a multi-folder workspace, add it before you start. The
editable ABAP is in `src/`; activating an object loads it into the running
system.

From an open-steamgate checkout the same pack runs in a terminal:
`OSD_PACKS=/path/to/osg-demo STG_PORT=8099 npm start`. The URLs in this book
use port 8099.

## Keys

The extension uses ADT's keys: **F9** runs a class (its classrun), **F8** runs
a report or previews a table or CDS view, **Ctrl+F2** checks, **Ctrl+F3**
activates, **Ctrl+Shift+F10** runs the ABAP Unit tests of the class or test include you are in (0.4; on 0.3.1370 only the test include),
**Ctrl+Shift+B** toggles a breakpoint. F9 and F8 act as debugger keys only while execution is paused
at a line (0.4); chapter 1 says what to do on 0.3.1370.

## How the book is organised

| Part | Chapters | What you do |
|---|---|---|
| Basics | 1 Hello, 2 Debug, tests and dumps | a class, its test, the debugger, a dump, a classic ALV |
| Services and apps | 3 OData, 4 Fiori, 5 CDS, 6 AMDP | the fleet as a service, an app, a cube, SQLScript |
| Out of the sandbox | 7 Take it to a system | an abapGit zip with what may travel |
| Operations | 8 Business log, 9 Background jobs | BAL logs, a job, a job chain, a doctor |
| Code that writes code | 10 Generated code, 11 Lift | templates and traces (L0, L1, L2), a lifted routine |
| Appendices | A Run the checks, B Take it to a system (what travels), C Limits and glossary | the automated checks, the transport list, the fine print |
