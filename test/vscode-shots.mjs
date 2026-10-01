// SPIKE: screenshots of the real VS Code with the open-steamgate extension.
//
//   CODE=<VS Code binary> VSIX=<extension .vsix> OSD_HOME=<open-steamgate checkout> \
//   WS=<a copy of this repository> OUT=<dir> xvfb-run -a node test/vscode-shots.mjs
//
// Drives VS Code (Electron) with Playwright's _electron from OSD_HOME's
// node_modules: a fresh user-data and extensions dir under /tmp/osd-shot, the
// extension installed from VSIX, the system started from OSD_HOME with this
// repository as a pack, then commands through the command palette. Headless
// Chromium renders a blank workbench, so this needs an X server (xvfb-run).
// Every step is screenshotted on its own; a failed step is reported and the
// run goes on. See docs/spike-vscode-shots.md.
import {execFileSync} from "node:child_process";
import {mkdirSync, rmSync, writeFileSync} from "node:fs";
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
mkdirSync(out, {recursive: true});
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
  // the workspace folder has an osd-pack.json and is layered on its own;
  // OSD_PACKS as well would bring the same objects in twice
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
  await win.screenshot({path: join(out, `${name}.png`)});
  console.log(`vscode-shots: ${name}.png`);
};

let failed = 0;
const step = async (name, body) => {
  try { await body(); } catch (e) { failed++; console.error(`vscode-shots: ${name} failed: ${e.message.split("\n")[0]}`); }
};

await step("workbench", () => shot("vscode-00-workbench"));
await step("start", async () => {
  // the exact title: a shorter query picks "osd: Choose which system Start runs"
  await palette("osd: Start (build + run this system)");
  // the system is up when its port answers; the extension's default URL
  for (let i = 0; i < 240; i++) {
    if (await fetch("http://localhost:3030/sap/bc/adt/discovery").then((r) => r.ok, () => false)) break;
    await win.waitForTimeout(1000);
  }
  await win.waitForTimeout(3000);
  await shot("vscode-01-started");
});
await step("classrun", async () => {
  await open("zosd_demo_hello.clas.abap");
  await win.keyboard.press("F9");
  await win.waitForTimeout(6000);
  await shot("vscode-02-classrun");
});
await step("tests", async () => {
  await palette("Testing: Focus on Test Explorer View");
  await win.waitForTimeout(2000);
  await palette("Test: Run All Tests");
  await win.waitForTimeout(20000);
  await shot("vscode-03-tests");
});
await step("data preview", async () => {
  await open("zosd_fleet_ship.tabl.xml");
  await win.keyboard.press("F8");
  await win.waitForTimeout(8000);
  await shot("vscode-04-data-preview");
});

await app.close();
console.log(`vscode-shots: ${failed} step(s) failed`);
process.exit(failed === 0 ? 0 : 1);
