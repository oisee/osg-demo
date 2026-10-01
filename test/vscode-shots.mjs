// Screenshots of the real VS Code with the open-steamgate extension, for the
// book (chapters 1, 2 and 15), taken on a workstation and committed to book/img/
// like the other pictures:
//
//   CODE=<VS Code binary> VSIX=<extension .vsix> OSD_HOME=<open-steamgate checkout> \
//   WS=<a copy of this repository> OUT=book/img xvfb-run -a node test/vscode-shots.mjs
//
// - CODE: the code binary of the desktop VS Code tarball (no install needed);
// - VSIX: a released extension (gh release download vscode-v0.4.1444 --repo
//   oisee/open-steamgate --pattern '*.vsix');
// - OSD_HOME: an open-steamgate checkout after npm install and npm run
//   bootstrap (Playwright comes from its node_modules);
// - WS: a copy, so no local path shows in a breadcrumb:
//   git archive main | tar -x -C <dir>.
// Headless Chromium renders a blank workbench, so this needs an X server.
// Without one, `apt download xvfb`, `dpkg -x` it into a scratch folder and put
// its usr/bin on PATH; xvfb-run also needs xauth.
//
// Drives VS Code (Electron) with Playwright's _electron: a fresh user-data and
// extensions dir under /tmp/osd-shot, the extension installed from VSIX, the
// system started from OSD_HOME with WS as its pack, then commands through the
// command palette. A picture is taken only once the window shows what it is
// about; the pictures go to OUT only when every step has passed.
import {execFileSync} from "node:child_process";
import {copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";

const need = (name) => {
  const value = process.env[name];
  if (!value) { console.error(`vscode-shots: set ${name}`); process.exit(2); }
  return resolve(value);
};
const code = need("CODE"), vsix = need("VSIX"), home = need("OSD_HOME"), ws = need("WS"), out = need("OUT");
const tmp = "/tmp/osd-shot";
rmSync(tmp, {recursive: true, force: true});
mkdirSync(join(tmp, "ud", "User"), {recursive: true});
mkdirSync(join(tmp, "shots"), {recursive: true});
writeFileSync(join(tmp, "ud", "User", "settings.json"), JSON.stringify({
  "workbench.startupEditor": "none",
  "workbench.colorTheme": "Default Light Modern",
  "window.title": "osg-demo",
  "window.zoomLevel": 0,
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
  await win.keyboard.press("Control+P");
  await win.waitForTimeout(400);
  await win.keyboard.type(file, {delay: 15});
  await win.waitForTimeout(1200);
  await win.keyboard.press("Enter");
  await win.waitForTimeout(1500);
};
const shot = async (name) => {
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
// a picture is taken only once the window shows what it is a picture of, so
// a step that fails leaves the committed picture as it was
const see = async (what, locator, timeout = 60000) => {
  await locator.first().waitFor({timeout}).catch(() => { throw new Error(`no ${what} on screen`); });
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
  await palette("View: Close All Editors");
  await win.waitForTimeout(500);
};

await step("start", async () => {
  // the exact title: a shorter query picks "osd: Choose which system Start runs"
  await palette("osd: Start (build + run this system)");
  // the system is up when the status bar shows its generation ("osd 726a0c3b");
  // the extension picks the port of the instance it launches
  await win.locator(".statusbar").getByText(/osd [0-9a-f]{7,} ·/).first().waitFor({timeout: 300000})
    .catch(async () => {
      await win.screenshot({path: join(tmp, "start-failed.png")});
      console.error(`vscode-shots: the window as it was: ${join(tmp, "start-failed.png")}`);
      throw new Error("the system did not start");
    });
  await win.waitForTimeout(3000);
});
if (failed) {
  // every later step needs the system: stop before it replaces good pictures
  await app.close();
  process.exit(1);
}
await step("classrun", async () => {
  await open("zosd_demo_hello.clas.abap");
  await win.keyboard.press("F9");
  await see("greeting in the osd console", win.locator(".panel").getByText("Hello from ZOSD_DEMO_HELLO."));
  await win.waitForTimeout(1000);
  await shot("vscode-classrun");
});
await step("tests", async () => {
  // the demo's own tests: Ctrl+Shift+F10 in the class, whose main file the
  // test item points at
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
  await see("ls_ship", win.locator(".debug-view-content").getByText("ls_ship"));
  // the first ship: the debug hover over ls_ship in the stopped line carries
  // the structure as JSON, "S001" in it
  const line = win.locator(".view-line", {hasText: "steam_check( ls_ship-steam_pct )"}).first();
  // the inner span is as wide as the text, the line itself as the editor
  const span = line.locator(":scope > span").first();
  const box = await span.boundingBox();
  const text = await span.textContent();
  const at = text.indexOf("ls_ship") + 2;
  await win.mouse.move(box.x + box.width * at / text.length, box.y + box.height / 2);
  // the widget's first line holds the structure as JSON, cut off on screen
  await see("S001 in ls_ship", win.locator(".debug-hover-widget").filter({hasText: '"S001"'}), 15000);
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
  await win.mouse.move(900, 470);
  await shot("vscode-services");
  // an entity set's row opens the method that serves it
  await osdView.locator(".monaco-list-row", {hasText: /ShipSet\s*get_entityset/}).first().click();
  await see("the method of ShipSet", win.locator(".tab.active", {hasText: "zcl_zosd_fleet_dpc_ext.clas.abap"}));
  await see("line 112", win.locator(".statusbar").getByText(/^Ln 112,/));
  await closePanels();
});
await step("http lens", async () => {
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
  await see("the call lens", lens("Call ShipSet"), 60000);
  await lens("Call ShipSet").click();
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
await step("readers", async () => {
  await closePanels();
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
