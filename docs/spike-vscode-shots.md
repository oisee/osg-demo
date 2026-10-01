# Spike: screenshots of VS Code with the extension

Question: can the book's VS Code screenshots be taken automatically, without a
person at a screen? Answer: yes, in GitHub Actions under Xvfb.

## What works

`.github/workflows/vscode-shots.yml` runs `test/vscode-shots.mjs` on pushes to
`spike/vscode-shots` and by hand. It checks out open-steamgate `main`,
bootstraps it, downloads the desktop VS Code (the linux-x64 tarball, no
install) and the latest released extension VSIX, and drives VS Code with
Playwright's `_electron` (from open-steamgate's `node_modules`) inside
`xvfb-run`. Screenshots come back as the workflow artifact `vscode-shots`.

Taken in the fourth run: the workbench, `osd: Start`, F9 on
`ZOSD_DEMO_HELLO` with `Hello from ZOSD_DEMO_HELLO.` in the osd console, the
Testing view with the demo's tests green under Workspace layers, and F8 Data
Preview of `ZOSD_FLEET_SHIP` with its six rows.

## What it took

- Headless Chromium (`--ozone-platform=headless`, no X server) renders a blank
  workbench: an X server is needed. The CI runner has `xvfb-run`; this
  workstation has no Xvfb and no sudo.
- Extensions install through the CLI script `bin/code`, not the Electron
  binary.
- A fresh user-data dir with settings: `workbench.startupEditor: none`, chat
  and the secondary side bar off, light theme, a fixed `window.title`, and
  `osd.home` pointing at the open-steamgate checkout (the bundled system of
  the released 0.3.1370 is too old for this pack, which needs 0.4).
- Commands go through the palette (F1) with their exact titles: `osd: Start`
  alone matches "osd: Choose which system Start runs", an interactive picker.
- The pack must come in once: the workspace folder has an `osd-pack.json` and
  is layered on its own; `OSD_PACKS` as well brings every object in twice and
  the build fails.
- The workspace is a copy under `/tmp/osg-demo`, so no runner path or user
  name shows in a window title or breadcrumb.
- Readiness: poll `http://localhost:3030/sap/bc/adt/discovery`, the
  extension's default `osd.url`.

## Not done yet

- "Test: Run All Tests" also runs the System group (slow, and its results
  scroll into the shot); run only Workspace layers.
- The debugger (breakpoint in `steam_check`, paused) and other views.
- Once the 0.4 extension is released, use it instead of 0.3.1370 + `osd.home`.
- Crops and a step that copies chosen shots into `book/img/`.
