// Screenshots of the real VS Code with the open-steamgate extension, for the
// book (chapters 1 and 2), taken on a workstation and committed to book/img/
// like the other pictures:
//
//   CODE=<VS Code binary> VSIX=<extension .vsix> OSD_HOME=<open-steamgate checkout> \
//   WS=<a copy of this repository> OUT=book/img xvfb-run -a node test/vscode-shots.mjs
//
// - CODE: the code binary of the desktop VS Code tarball (no install needed);
// - VSIX: a released extension (gh release download vscode-v0.4.1414 --repo
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
  // the extension declares no ABAP language, so an .abap file is Plain Text
  // and takes a breakpoint only with this (chapter 2 says so too)
  "debug.allowBreakpointsEverywhere": true,
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
  try { await body(); } catch (e) { failed++; console.error(`vscode-shots: ${name} failed: ${e.message.split("\n")[0]}`); }
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
  // the tree is built before the system serves; refreshed, it has the
  // workspace's tests (chapter 1 says so too)
  await palette("Testing: Focus on Test Explorer View");
  await win.waitForTimeout(1500);
  await palette("Test: Refresh Tests");
  await win.waitForTimeout(8000);
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
});

await app.close();
console.log(`vscode-shots: ${failed} step(s) failed`);
if (failed) process.exit(1);
mkdirSync(out, {recursive: true});
for (const name of readdirSync(join(tmp, "shots"))) copyFileSync(join(tmp, "shots", name), join(out, name));
console.log(`vscode-shots: the pictures are in ${out}`);
