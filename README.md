ABAP running locally in VS Code, no SAP or ADT connection.

# open-steamgate demo

This folder is an abapGit repository and an open-steamgate workspace pack. The extension carries a whole local ABAP system; this repository adds its own objects on top of it.

## Install

1. Install the **open-steamgate** extension (`oisee.open-steamgate`, pre-release). Search for it in the Extensions view, or take the `.vsix` from the latest [`vscode-v*` release](https://github.com/oisee/open-steamgate/releases) and run **Extensions: Install from VSIX…**.
2. Clone this repository and open the clone as a VS Code folder.
3. Run **osd: Start (build + run this system)**. The bundled system starts. Because this folder has an `osd-pack.json`, it is layered on top as a full pack: its classes, tables, seed rows and page, in package `$ZOSD_DEMO`. The folder shows up under **Workspace layers** in Test Explorer.

To add this folder to a multi-folder workspace, add it before you start.

From an open-steamgate checkout, the same pack runs in a terminal: `OSD_PACKS=/path/to/osg-demo STG_PORT=8099 npm start`, with a free port. The editable ABAP is in `src/`; activating an object loads it into the running system.

## The story

The chapters run on one small domain this repository owns: a fleet of airships and their voyages. Chapter 1 needs nothing but a class. From chapter 2 on, the fleet's tables, service and app are used; [the fleet contract](docs/fleet-contract.md) fixes their names and shapes.

## 1. Hello

1. Open [ZOSD_DEMO_HELLO](src/zosd_demo_hello.clas.abap), place the cursor in the class and press **F9**. Expected: the **osd console** shows `Hello from ZOSD_DEMO_HELLO.`
2. Open Testing, expand **Workspace layers > osg-demo > ZOSD_DEMO_HELLO**, and run `known_line`; alternatively press **Ctrl+Shift+F10** in the class. Expected: one green ABAP Unit test.
3. Change the text returned by `greeting( )`, press **Ctrl+F2** to check, **Ctrl+F3** to save and activate, then **F9** again. Expected: the console shows your new text. Restore the original text, activate, and rerun the test to leave it green.

## 2. Debug, tests, and dumps

Coming. The report, debugger, failing-test, and dump exercises are drafted in [Next chapters](docs/next-chapters.md).

## 3. OData ladder

Coming. The core service navigation and method map are drafted in [Next chapters](docs/next-chapters.md).

## 4. Fiori apps and APC

Coming. The core APC example and planned Fiori exercise are noted in [Next chapters](docs/next-chapters.md).

## 5. AMDP

Coming. See [Running on HANA](docs/hana.md) and the planned exercise in [Next chapters](docs/next-chapters.md).

## 6. Take it to a system

Coming. The reviewed offline packaging path is in [Take it to a system](docs/take-to-system.md).

## Run the checks

In an open-steamgate checkout, run `npm install && npm run bootstrap` once. Then `OSD_HOME=/path/to/open-steamgate node test/slice.mjs` builds that engine checkout with this folder as a pack, starts it on a free port and checks the Airship fleet end to end: six ships in `ShipSet`, the fleet report's classrun, a `$filter` on status, a MERGE that reads back, the launchpad tile opening the list report (this one needs a browser that reaches ui5.sap.com; `SLICE_SKIP_UI=1` skips it and says so, `SLICE_CHROMIUM=<path>` picks the browser), and the report's ABAP Unit test. The engine's main branch is enough; the app's BSP copy under `/sap/bc/ui5_ui5/sap/zosg_demo/` also needs the engine's pack-app manifest rebase (branch `vg/pack-manifest-rebase` until merged). It stops the engine it started, and exits non-zero if any check fails.
