ABAP running locally in VS Code, no SAP or ADT connection.

# open-steamgate demo

This folder is an abapGit repository and an open-steamgate workspace layer. Clone it, install the open-steamgate VS Code extension from a `.vsix` built from [open-steamgate main](https://github.com/oisee/open-steamgate), and open the clone as a VS Code workspace folder. The minimum extension build is **`vscode-v0.1.1111`**, built from main revision `d67f8660`; from a fresh clone of that checkout run `npm install && npm run bootstrap && npm run vsix` (bootstrap fetches the pinned libraries and pack sources; see its docs/vscode-extension.md) and install the resulting `build/vsix/osd-vscode-0.1.1111.vsix`. Run **osd: Start (build + run this system)**. The extension discovers this folder and links its `src/` through `OSD_PACKS` as a workspace layer. It then appears under **Workspace layers** in Test Explorer. Add this folder before starting when using a multi-folder workspace.

For a terminal runtime, from an open-steamgate checkout run `OSD_PACKS=/path/to/osg-demo STG_PORT=8099 npm start` with a free port and an isolated database. Pack discovery should list `osg-demo` and package `$ZOSD_DEMO`. The editable ABAP is in `src/`; activation loads edits into the local runtime.

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
