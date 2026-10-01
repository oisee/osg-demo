# Spike: screenshots of VS Code with the extension

Question: can the book's VS Code screenshots be taken by a script, without a
person at a screen? Answer: yes. `test/vscode-shots.mjs` drives the desktop
VS Code with Playwright's `_electron` under Xvfb. It first ran in GitHub
Actions; it now runs on a workstation, and its pictures are committed to
`book/img/` like those of `test/book-shots.mjs` and `test/cli-shots.mjs`.
A run takes about three minutes, against about nine for a CI round trip.

The script's header says how to run it. It takes eight pictures:

- F9 on `ZOSD_DEMO_HELLO`, with the greeting in the osd console
  (`vscode-classrun.png`, chapter 1);
- Ctrl+Shift+F10 in that class, with one green test (`vscode-testing.png`,
  chapter 1);
- F8 Data Preview of `ZOSD_FLEET_SHIP` (`vscode-data-preview.png`, chapter 2);
- the debugger stopped on `steam_check` in `ZCL_OSD_FLEET_REPORT`
  (`vscode-debugger.png`, chapter 2);
- for chapter 15: the System view with `ZOSD_FLEET_SRV` (`vscode-services.png`),
  `http/fleet.http` with the method above each request (`vscode-http-lens.png`),
  "Call ShipSet" with its HTTP answer (`vscode-call-entityset.png`), and the
  readers of `ZCL_OSD_FLEET_REPORT` (`vscode-readers.png`).

## What it took

- An X server. Headless Chromium (`--ozone-platform=headless`) renders a blank
  workbench. Without sudo, `apt download xvfb` and `dpkg -x` give a working
  Xvfb in a scratch folder; the libraries it needs are already there with the
  X server packages.
- The desktop VS Code tarball, no install. Extensions are installed through its
  CLI script `bin/code`, not the Electron binary.
- A fresh user-data dir with settings: no start editor, chat and the secondary
  side bar off, the light theme, a fixed `window.title`, and `osd.home`
  pointing at the open-steamgate checkout.
- Commands through the palette (F1) with their exact titles: `osd: Start`
  alone matches "osd: Choose which system Start runs", an interactive picker.
- The pack comes in once. The workspace folder has an `osd-pack.json`, so
  `OSD_PACKS` must stay empty (open-steamgate #348).
- The workspace is a copy (`git archive main`), so no local path or user name
  shows in a window title or breadcrumb.
- Readiness: the status bar shows `osd <generation> · SQLite` once the system
  serves.

## Found in the extension (0.4.1414, reported to its owner)

The first two are confirmed and fixed in the next 0.4.x patch.


- **Breakpoints:** the extension declares no ABAP language, so an `.abap` file
  opens as Plain Text and VS Code refuses a breakpoint there.
  `debug.allowBreakpointsEverywhere` works around it; chapter 2 says so.
- **Test tree:** the Testing tree is built before the system serves, so it has
  no workspace tests until **Test: Refresh Tests**; chapter 1 says so.
- **Variables:** the Variables view and the debug hover show the runtime's
  JavaScript objects (`ls_ship = Structure {value: …}`), not the ABAP fields;
  the hover's first line carries the structure as JSON, which is where the
  script finds `S001`. Chapter 2 says so.
- **Attach debugger and call ShipSet:** a breakpoint in the DPC method stayed
  unbound and the call ran through; chapter 15 says so.
