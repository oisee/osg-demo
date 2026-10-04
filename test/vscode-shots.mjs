// Screenshots of the real VS Code with the open-steamgate extension, for the
// book (chapters 1, 2, 9, 15, 16 and 17), taken on a workstation and committed to book/img/
// like the other pictures:
//
//   CODE=<VS Code binary> VSIX=<extension .vsix> OSD_HOME=<open-steamgate checkout> \
//   WS=<a copy of this repository> OUT=book/img \
//   xvfb-run -a -s "-screen 0 1440x900x24" node test/vscode-shots.mjs
//
// Run this command under OSD_HOME/tools/osd-heavy.sh; put Node 24 on PATH.
// - CODE: the code binary of the desktop VS Code tarball (no install needed);
// - VSIX: a released extension (gh release download vscode-v0.6.1650 --repo
//   oisee/open-steamgate --pattern '*.vsix');
// - OSD_HOME: the tag checkout after npm ci, bootstrap, the CI transpiler
//   build and four osd-link steps, then bootstrap again for warm support
//   (Playwright comes from its node_modules);
// - SHOTS_TMP: short scratch path (default: a unique /tmp/osd-shot-* directory);
//   keep TMPDIR short too for debugger sockets.
// - WS: a disposable copy, so no local path shows in a breadcrumb:
//   git archive HEAD | tar -x -C <dir>.
// Headless Chromium renders a blank workbench, so this needs an X server.
// Without one, `apt download xvfb`, `dpkg -x` it into a scratch folder and put
// its usr/bin on PATH; xvfb-run also needs xauth.
//
// Drives VS Code (Electron) with Playwright's _electron: a fresh user-data and
// extensions dir under SHOTS_TMP (or the unique temporary directory), the extension
// installed from VSIX, the system started from OSD_HOME with WS as its pack, then
// commands through the command palette. A picture is taken only once the window shows what it is
// about; the pictures go to OUT only when every step has passed.
import {execFileSync} from "node:child_process";
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";

const need = (name) => {
  const value = process.env[name];
  if (!value) { console.error(`vscode-shots: set ${name}`); process.exit(2); }
  return resolve(value);
};
const code = need("CODE"), vsix = need("VSIX"), home = need("OSD_HOME"), ws = need("WS"), out = need("OUT");
const tmp = process.env.SHOTS_TMP || mkdtempSync(join("/tmp", "osd-shot-"));
// TMPDIR may be inside this directory; preserve it for debugger sockets.
for (const name of ["ud", "ext", "shots"]) rmSync(join(tmp, name), {recursive: true, force: true});
mkdirSync(join(tmp, "ud", "User"), {recursive: true});
mkdirSync(join(tmp, "shots"), {recursive: true});
writeFileSync(join(tmp, "ud", "User", "settings.json"), JSON.stringify({
  "workbench.startupEditor": "none",
  "workbench.colorTheme": "Default Light Modern",
  "window.title": "osg-demo",
  "window.zoomLevel": 0,
  "output.wordWrap": true,
  "telemetry.telemetryLevel": "off",
  "update.mode": "none",
  "extensions.autoUpdate": false,
  "security.workspace.trust.enabled": false,
  "osd.home": home,
  "chat.disableAIFeatures": true,
  "workbench.secondarySideBar.defaultVisibility": "hidden",
  "workbench.tips.enabled": false,
}, null, 2));
// the CLI script beside the Electron binary installs extensions
execFileSync(join(dirname(code), "bin", "code"), ["--install-extension", vsix, "--extensions-dir", join(tmp, "ext"), "--user-data-dir", join(tmp, "ud")],
  {stdio: "inherit"});

// Use placeholders for the request file's illustrative host in pictures.
const httpFile = join(ws, "http", "fleet.http");
writeFileSync(httpFile, readFileSync(httpFile, "utf8")
  .replace("http://localhost:8099", "{{system}}")
  .replace("http://127.0.0.1:<port>", "<system address>"));

const {_electron} = createRequire(join(home, "package.json"))("playwright");
const app = await _electron.launch({
  executablePath: code,
  args: [ws, "--extensions-dir", join(tmp, "ext"), "--user-data-dir", join(tmp, "ud"),
    "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes", "--disable-gpu"],
  // the workspace folder is the pack; OSD_PACKS as well would bring it twice
  env: {...process.env, OSD_PACKS: ""},
  timeout: 120000,
});
const win = await app.firstWindow();
await win.waitForSelector(".monaco-workbench", {timeout: 120000});
await win.waitForTimeout(3000);

const palette = async (text) => {
  await win.keyboard.press("F1");
  await win.waitForTimeout(400);
  await win.keyboard.type(text, {delay: 15});
  await win.waitForTimeout(800);
  await win.keyboard.press("Enter");
};
const open = async (file) => {
  await palette("View: Focus Active Editor Group");
  await win.keyboard.press("Control+P");
  await win.waitForTimeout(400);
  await win.keyboard.type(file, {delay: 15});
  await win.waitForTimeout(1200);
  await win.keyboard.press("Enter");
  await win.waitForTimeout(1500);
};
const shot = async (name) => {
  await win.mouse.move(900, 470);
  await win.waitForTimeout(500);
  const status = await win.locator(".statusbar").innerText();
  if (!/OSD generation [0-9a-f]{7,} · SQLite · warm\b/.test(status) || status.includes("cold:")) {
    throw new Error("the status bar must show SQLite · warm before capture");
  }
  console.log(`vscode-shots: ${name}: ${status.match(/OSD generation [0-9a-f]{7,} · SQLite · warm\b/)[0]}`);
  await win.screenshot({path: join(tmp, "shots", `${name}.png`)});
  console.log(`vscode-shots: ${name}.png`);
};

let failed = 0;
const step = async (name, body) => {
  try { await body(); } catch (e) {
    failed++;
    console.error(`vscode-shots: ${name} failed: ${e.message.split("\n")[0]}`);
    // the window as it was, for whoever looks into it; never into OUT
    await win.screenshot({path: join(tmp, `failed-${name.replace(/\W+/g, "-")}.png`)}).catch(() => {});
  }
};

const goto = async (line) => {
  await win.keyboard.press("Control+G");
  await win.waitForTimeout(300);
  await win.keyboard.type(String(line));
  await win.keyboard.press("Enter");
  await win.waitForTimeout(500);
};
// Resize through VS Code's actual splitter, not the panel's content border.
const resizePanel = async (y) => {
  for (const sash of await win.locator(".monaco-sash.horizontal:not(.disabled)").all()) {
    const box = await sash.boundingBox();
    if (!box || box.width < 1000 || box.y < 100 || box.y > 850) continue;
    await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await win.mouse.down();
    await win.mouse.move(box.x + box.width / 2, y, {steps: 15});
    await win.mouse.up();
    await win.waitForTimeout(500);
    const panel = await win.locator(".part.panel").boundingBox();
    if (!panel || Math.abs(panel.y - y) > 12) throw new Error("panel resize did not take effect");
    return;
  }
  throw new Error("no panel splitter on screen");
};
// a picture is taken only once the window shows what it is a picture of, so
// a step that fails leaves the committed picture as it was
const see = async (what, locator, timeout = 60000) => {
  await locator.first().waitFor({timeout}).catch(() => { throw new Error(`no ${what} on screen`); });
};
const outputText = async () => (await win.locator(".panel .view-line:visible").allTextContents())
  .map(line => line.replaceAll("\u00a0", " ")).join("\n");
const hasOutput = async (expected) => {
  const text = await outputText();
  return typeof expected === "string" ? text.includes(expected) : expected.test(text);
};
const seeOutput = async (expected, timeout = 60000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await hasOutput(expected)) return;
    await win.waitForTimeout(250);
  }
  throw new Error(`no ${expected} in the visible output`);
};

// a webview (Data Preview) renders in nested frames
const seeInWebview = async (text, timeout = 60000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    for (const frame of win.frames()) {
      if (await frame.getByText(text, {exact: typeof text === "string"}).count().catch(() => 0)) return;
    }
    await win.waitForTimeout(500);
  }
  throw new Error(`no ${text} in the webview`);
};
// one row of a webview table holds all the given texts
const seeRowInWebview = async (texts, timeout = 30000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    for (const frame of win.frames()) {
      let row = frame.locator("tr");
      for (const text of texts) row = row.filter({hasText: text});
      if (await row.count().catch(() => 0)) return;
    }
    await win.waitForTimeout(500);
  }
  throw new Error(`no row with ${texts.join(", ")} in the webview`);
};
const lineOf = (file, text) => readFileSync(join(ws, file), "utf8").split("\n").findIndex((l) => l.includes(text)) + 1;
const closePanels = async () => {
  await palette("View: Join All Editor Groups");
  await palette("View: Close All Editors");
  await win.waitForTimeout(500);
};

await step("start", async () => {
  // the exact title: a shorter query picks "osd: Choose which system Start runs"
  await palette("osd: Start (build + run this system)");
  // the system is up when the status bar shows its labelled serving generation;
  // the extension picks the port of the instance it launches
  await win.locator(".statusbar").getByText(/OSD generation [0-9a-f]{7,} ·/).first().waitFor({timeout: 300000})
    .catch(async () => {
      await win.screenshot({path: join(tmp, "start-failed.png")});
      console.error(`vscode-shots: the window as it was: ${join(tmp, "start-failed.png")}`);
      throw new Error("the system did not start");
    });
  await see("jobs status", win.locator(".statusbar").getByText(/OSD jobs:/));
  await win.waitForTimeout(3000);
});
if (failed) {
  // every later step needs the system: stop before it replaces good pictures
  await app.close();
  process.exit(1);
}
await step("classrun", async () => {
  await open("zosd_demo_hello.clas.abap");
  // A proxy can briefly close the first connection after startup. Retrying
  // this greeting is safe; scheduling jobs below is never retried.
  for (let attempt = 0; attempt < 3; attempt++) {
    await win.keyboard.press("F9");
    await seeOutput(/Hello from ZOSD_DEMO_HELLO\.|osd classrun ZOSD_DEMO_HELLO: fetch failed/, 120000);
    if (await hasOutput("Hello from ZOSD_DEMO_HELLO.")) break;
    if (attempt === 2) throw new Error("the greeting request failed three times");
    await win.locator(".panel .codicon-clear-all:visible").click();
    await palette("View: Focus Active Editor Group");
    await win.waitForTimeout(1000);
  }
  await palette("Notifications: Clear All Notifications");
  await win.waitForTimeout(1000);
  await shot("vscode-classrun");
});
await step("open sample", async () => {
  await palette("OSD: Open sample");
  await see("sample picker", win.getByText("OSD: Open sample", {exact: true}));
  await see("hello sample", win.locator(".quick-input-list").getByText("ZOSD_DEMO_HELLO", {exact: true}));
  await see("bundled notebook", win.locator(".quick-input-list").getByText("Bundled notebook", {exact: true}));
  await shot("vscode-open-sample");
  await win.keyboard.press("Escape");
});
await step("tests", async () => {
  // the demo's own tests: Ctrl+Shift+F10 in the class, whose main file the
  // test item points at
  // no "Test: Refresh Tests": the Testing tree fills itself after osd: Start
  // (since 0.4.1444). Ctrl+Shift+F10 runs only the test items of this file, so the
  // result below proves they are there; on 0.4.1414 the same key, without a
  // refresh, ran nothing
  await open("zosd_demo_hello.clas.abap");
  await win.waitForTimeout(3000);
  await win.keyboard.press("Control+Shift+F10");
  await see("test result", win.locator(".panel").getByText(/ZOSD_DEMO_HELLO: 1 passed, 0 failed/), 120000);
  await palette("Testing: Focus on Test Explorer View");
  await win.waitForTimeout(2000);
  await shot("vscode-testing");
});
await step("data preview", async () => {
  await closePanels();
  await palette("View: Show Explorer");
  await palette("View: Hide Panel");
  await open("zosd_fleet_ship.tabl.xml");
  await win.keyboard.press("F8");
  // all six ships, the last one included
  await seeInWebview(/ZOSD_FLEET_SHIP -- 6 rows/);
  await seeInWebview("Old Boiler");
  await win.waitForTimeout(1000);
  await shot("vscode-data-preview");
});
// Capture supervised jobs before attaching a debugger: debugger runtime
// reloads can race the worker's SQLite recovery in the released extension.
await step("kernel diagnostics", async () => {
  await closePanels();
  await palette("View: Show Explorer");
  // Demonstrate a rejected form with an unsaved edit. The actual class
  // correctly uses bytes; editing the buffer does not rebuild the system.
  await open("zcl_wasm_mandel.clas.abap");
  const originalLine = readFileSync(join(ws, "src", "iti", "zcl_wasm_mandel.clas.abap"), "utf8").split("\n")[141];
  await goto(142);
  await win.keyboard.press("Home");
  await win.keyboard.press("Home");
  await win.keyboard.press("Shift+End");
  await win.keyboard.insertText("    DATA lv_a TYPE i. DATA lv_b TYPE i. DATA lv_r TYPE i.");
  await goto(144);
  await palette("View: Toggle Problems");
  await see("OSD kernel diagnostic", win.locator(".panel").getByText(/OSD kernel/));
  await see("support link", win.locator(".panel a").filter({hasText: /bit|offset|kernel/i}));
  await shot("vscode-kernel-diagnostic");
  await palette("View: Focus Active Editor Group");
  await goto(142);
  await win.keyboard.press("Home");
  await win.keyboard.press("Home");
  await win.keyboard.press("Shift+End");
  await win.keyboard.insertText(originalLine);
  await see("original byte operands restored", win.locator(".view-line", {hasText: /DATA.lv_a.TYPE.x.LENGTH.4/}));
  await closePanels();
});

// Jobs are run by the extension's supervised worker, not an external CLI.
const outputAutoScroll = async (enabled) => {
  const toggle = win.locator(enabled ? ".panel .codicon-unlock:visible" : ".panel .codicon-lock:visible");
  if (await toggle.count()) await toggle.click();
};
const runClass = async (file, text, maximize = false) => {
  // Each assertion reads this invocation, never a previous state snapshot.
  await palette("Output: Focus on Output View");
  await win.locator(".panel select:visible").selectOption({label: "osd console"});
  await outputAutoScroll(true);
  await win.locator(".panel .codicon-clear-all:visible").click();
  await open(file);
  await win.keyboard.press("F9");
  if (maximize && await win.locator(".part.editor").isVisible()) {
    await palette("View: Toggle Maximized Panel");
  }
  await seeOutput(text, 120000);
};
const showJobs = async () => {
  await win.locator(".statusbar").getByText(/OSD jobs:/).click();
  await see("What is running picker", win.getByText("OSD: What is running?", {exact: true}));
  await win.locator(".quick-input-list .monaco-list-row").filter({hasText: "Job worker"}).click();
  // Output normally follows the last row; this summary puts newest runs first.
  await palette("Output: Focus on Output View");
  await outputAutoScroll(false);
  await win.keyboard.press("Control+Home");
  await win.keyboard.press("Escape");
  await seeOutput(/OSD jobs — latest 200 runs, newest first/);
};
await step("fleet jobs", async () => {
  await closePanels();
  await palette("View: Show Explorer");
  await runClass("zcl_osd_fleet_job.clas.abap", /Fleet job ZOSD_FLEET_AUDIT/);
  await showJobs();
  await seeOutput(/ZOSD_FLEET_AUDIT/, 120000);
  await seeOutput(/ZOSD_FLEET_AUDIT \| DONE \|/);
  await shot("vscode-fleet-jobs");
});
await step("night jobs", async () => {
  await showJobs();
  await win.locator(".panel .codicon-clear-all:visible").click();
  await runClass("zcl_osd_fleet_night_jobs.clas.abap", /Night set, mode P, run .*SUBMITTED/);
  await showJobs();
  await seeOutput(/L3_NIGHT_/, 120000);
  await seeOutput(/L3_NIGHT_[^\n]* \| DONE \|/);
  await shot("vscode-night-jobs");
});
await step("watch glass", async () => {
  await runClass("zcl_osd_fleet_watch_jobs.clas.abap", /Watch set, mode P, run .*SUBMITTED/);
  // Re-run the read-only state class until the worker reaches the glass.
  for (let i = 0; i < 30; i++) {
    await runClass("zcl_osd_fleet_watch_state.clas.abap", /Watch set, run/, true);
    if (await hasOutput(/Budget: GLASS/)) break;
    await win.waitForTimeout(1000);
  }
  await seeOutput(/Budget: GLASS/);
  await seeOutput(/Doctor: RUNNING/);
  await shot("vscode-watch-glass");
});
await step("watch final", async () => {
  await runClass("zcl_osd_fleet_watch_glass.clas.abap", /Continue run .* with glass 2: X/);
  for (let i = 0; i < 30; i++) {
    await runClass("zcl_osd_fleet_watch_state.clas.abap", /Watch set, run/, true);
    if (await hasOutput(/Doctor: STOPPED/)) break;
    await win.waitForTimeout(1000);
  }
  await seeOutput(/Doctor: STOPPED/);
  await seeOutput(/Lock on 20261001: RELEASED/);
  await seeOutput(/Budget: NARROW, glass 2/);
  // The CONTINUE audit event names the ABAP user. Exclude that line with
  // the normal Output filter; the state, budget and both alerts stay visible.
  await win.locator('.panel input[placeholder^="Filter"]').fill("!by ");
  await win.waitForTimeout(500);
  await seeOutput(/Doctor: STOPPED/);
  await seeOutput(/Budget: NARROW, glass 2/);
  if (await hasOutput(/ by \S+/)) throw new Error("an audit user is still visible");
  await shot("vscode-watch-final");
});

await step("reset console after jobs", async () => {
  await palette("Output: Focus on Output View");
  await win.locator('.panel input[placeholder^="Filter"]:visible').fill("");
  await win.locator(".panel .codicon-clear-all:visible").click();
});

await step("debugger", async () => {
  await closePanels();
  const file = "src/zcl_osd_fleet_report.clas.abap";
  await open("zcl_osd_fleet_report.clas.abap");
  await goto(lineOf(file, "steam_check( ls_ship-steam_pct )."));
  await win.keyboard.press("Control+Shift+B");
  await win.waitForTimeout(1500);
  await palette("osd: Run as ABAP Application with debugger");
  await see("stop on the breakpoint", win.getByText("Paused On Breakpoint"), 120000);
  await palette("View: Show Run and Debug");
  await win.waitForTimeout(1500);
  // the method's own variables, with ls_ship and its first ship
  await win.locator(".debug-view-content .monaco-list-row", {hasText: "Local:"}).first().click();
  await win.keyboard.press("ArrowRight");
  await see("ls_ship", win.locator(".debug-view-content").getByText("ls_ship"));
  // The debug hover exposes ABAP components, not runtime JSON.
  const line = win.locator(".view-line", {hasText: "steam_check( ls_ship-steam_pct )"}).first();
  // the inner span is as wide as the text, the line itself as the editor
  const span = line.locator(":scope > span").first();
  const box = await span.boundingBox();
  const text = await span.textContent();
  const at = text.indexOf("ls_ship") + 2;
  await win.mouse.move(box.x + box.width * at / text.length, box.y + box.height / 2);
  await see("ABAP ship_id in ls_ship", win.locator(".debug-hover-widget").filter({hasText: "S001"}), 15000);
  await win.mouse.move(200, 460);
  const shipRow = win.locator(".debug-view-content .monaco-list-row", {hasText: /^ls_ship/}).first();
  await shipRow.click();
  await win.keyboard.press("ArrowRight");
  await see("ABAP scalar ship_id", win.locator(".debug-view-content").getByText(/ship_id.*S001/));
  // away from the editor, where a hover would open over the code
  await win.mouse.move(200, 460);
  await win.waitForTimeout(1500);
  await shot("vscode-debugger");
  await win.keyboard.press("Shift+F5");
  await win.waitForTimeout(2000);
  // the breakpoint off again, the way it was set, so no later picture has it
  await open("zcl_osd_fleet_report.clas.abap");
  await goto(lineOf(file, "steam_check( ls_ship-steam_pct )."));
  await win.keyboard.press("Control+Shift+B");
  await win.waitForTimeout(800);
});

// chapter 15: from a service to its code and from the code to the HTTP result
const osdView = win.locator('[id="workbench.view.extension.osd"]');
const expandRow = async (text) => {
  const row = osdView.locator(".monaco-list-row", {hasText: text}).first();
  await see(`${text} in the System view`, row, 30000);
  await row.click();
  await win.keyboard.press("ArrowRight");
  await win.waitForTimeout(1500);
};
const lens = (text) => win.locator(".codelens-decoration a", {hasText: text}).first();
await step("services", async () => {
  await closePanels();
  await palette("View: Hide Panel");
  await palette("View: Show OSD");
  await win.keyboard.press("Escape");
  await win.waitForTimeout(1500);
  // Layers names local folders: closed, so no path shows
  const layers = osdView.locator(".monaco-list-row", {hasText: "Layers"}).first();
  await layers.click();
  await win.keyboard.press("ArrowLeft");
  await expandRow("Services");
  await expandRow("OData (");
  await expandRow("ZOSD_FLEET_SRV");
  for (const method of [/ShipSet\s*get_entityset/, /VoyageSet\s*get_entityset/, /ShipSet\s*get_entity$/]) {
    await see(`${method} in the System view`, osdView.locator(".monaco-list-row", {hasText: method}));
  }
  await see("the service's details", win.locator(".tab.active", {hasText: "ZOSD_FLEET_SRV · Details"}));
  // Service details print absolute source-link labels in this release.
  // Open the console below them and size it with the normal panel divider;
  // the visible details contain the service and model classes, not the links.
  await palette("View: Toggle Output");
  await see("visible output panel", win.locator(".part.panel"));
  await resizePanel(400);
  await shot("vscode-services");
  await resizePanel(576);
  // an entity set's row opens the method that serves it
  await osdView.locator(".monaco-list-row", {hasText: /ShipSet\s*get_entityset/}).first().click();
  await see("the method of ShipSet", win.locator(".tab.active", {hasText: "zcl_zosd_fleet_dpc_ext.clas.abap"}));
  await see("line 112", win.locator(".statusbar").getByText(/^Ln 112,/));
  await closePanels();
});
await step("http lens", async () => {
  await palette("View: Hide Panel");
  await open("fleet.http");
  for (const [what, line] of [["ShipSet › GET_ENTITYSET", 112], ["ShipSet › GET_ENTITY ", 224], ["VoyageSet › GET_ENTITYSET", 297]]) {
    await see(`the lens ${what}`, lens(`${what}`.trim() + ` → zcl_zosd_fleet_dpc_ext:${line} (static)`), 60000);
  }
  await see("the unresolved lens", lens("unresolved: query options are unsupported"));
  await shot("vscode-http-lens");
});
await step("call", async () => {
  await lens("ShipSet › GET_ENTITYSET").click();
  await see("the DPC method", win.locator(".tab.active", {hasText: "zcl_zosd_fleet_dpc_ext.clas.abap"}));
  await see("line 112", win.locator(".statusbar").getByText(/^Ln 112,/));
  // the plain call, not "Attach debugger and call ShipSet" beside it
  const plainCall = lens(/^▶\s*Call ShipSet$/);
  await see("the call lens", plainCall, 60000);
  await plainCall.click();
  // the answer of this call: its URL, its status and row count, its columns
  await seeInWebview("/sap/opu/odata/sap/ZOSD_FLEET_SRV/ShipSet?$top=20&$format=json");
  await seeInWebview(/HTTP 200 -- \d+ ms -- 6 row\(s\)/);
  await seeInWebview("StatusText");
  // all six ships, each with the status text the method fills in
  for (const row of [["S001", "Albatross", "Aloft"], ["S002", "Nimbus", "Docked"], ["S003", "Brass Heron", "Aloft"],
    ["S004", "Cumulus", "Maintenance"], ["S005", "Lady Kelvin", "Docked"], ["S006", "Old Boiler", "Maintenance"]]) {
    await seeRowInWebview(row);
  }
  await win.mouse.move(900, 470);
  await win.waitForTimeout(1000);
  await shot("vscode-call-entityset");
});
await step("call with debugger", async () => {
  // Chapter 15: capture the stopped request with ABAP values.
  // On purpose after the plain call and in this long session: the case that
  // ran through before 0.5.1486
  const dpc = "src/zcl_zosd_fleet_dpc_ext.clas.abap";
  await closePanels();
  await open("zcl_zosd_fleet_dpc_ext.clas.abap");
  const at = lineOf(dpc, "lt_ship_id = ranges_for(");
  await goto(at);
  await win.keyboard.press("Control+Shift+B");
  await see("a bound breakpoint", win.locator(".cgmr.codicon-debug-breakpoint:not(.codicon-debug-breakpoint-unverified)"), 60000);
  await goto(lineOf(dpc, "METHOD shipset_get_entityset.") - 1);
  await see("the call lens", lens("Attach debugger and call ShipSet"), 60000);
  try {
    await lens("Attach debugger and call ShipSet").click();
    await see("the stop in shipset_get_entityset", win.getByText("Paused On Breakpoint"), 60000);
    await palette("View: Show Run and Debug");
    await win.locator(".debug-view-content .monaco-list-row", {hasText: "Local:"}).first().click();
    await win.keyboard.press("ArrowRight");
    // The request arguments are visible at this first statement. Collapse
    // the JS call stack, whose generated-source labels contain local paths.
    await win.getByText("Call Stack", {exact: true}).first().click();
    await win.getByText("Watch", {exact: true}).first().click();
    await see("ABAP entity name", win.locator(".debug-view-content .monaco-list-row", {hasText: /iv_entity_name.*Ship/}));
    await see("ABAP table display", win.locator(".debug-view-content .monaco-list-row", {hasText: /et_entityset.*standard table/}));
    await goto(at);
    await shot("vscode-debug-entityset");
  } catch (error) {
    await win.screenshot({path: join(tmp, "failed-paused-entityset.png")});
    throw error;
  } finally {
    // whatever happened, no session and no breakpoint for the later pictures
    await win.keyboard.press("Shift+F5");
    await win.waitForTimeout(2000);
    await open("zcl_zosd_fleet_dpc_ext.clas.abap");
    await goto(at);
    await win.keyboard.press("Control+Shift+B");
  }
  await win.locator(".cgmr.codicon-debug-breakpoint").first().waitFor({state: "detached", timeout: 15000})
    .catch(() => { throw new Error("the DPC breakpoint is still set"); });
});
await step("readers", async () => {
  await closePanels();
  // back to the System view the earlier pictures show, not Run and Debug
  await palette("View: Show OSD");
  await win.keyboard.press("Escape");
  await open("zcl_osd_fleet_report.clas.abap");
  // the lens sits over the definition, at the top
  await goto(1);
  await see("the readers lens", lens("read by 1 · tests 0 · services 0"), 60000);
  await lens(/read by/).click();
  await see("the reader", win.locator(".quick-input-widget .monaco-list-row", {hasText: "ZCL_OSD_FLEET_TRAN"}), 15000);
  await win.waitForTimeout(800);
  await shot("vscode-readers");
  await win.keyboard.press("Escape");
});



await app.close();
console.log(`vscode-shots: ${failed} step(s) failed`);
if (failed) process.exit(1);
mkdirSync(out, {recursive: true});
for (const name of readdirSync(join(tmp, "shots"))) copyFileSync(join(tmp, "shots", name), join(out, name));
console.log(`vscode-shots: the pictures are in ${out}`);
