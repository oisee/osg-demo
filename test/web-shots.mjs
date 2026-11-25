// Chapter 23: the fleet in VS Code for the Web. @vscode/test-web serves VS Code
// in headless Chromium with open-steamgate's browser entry (the gateway runs in
// the extension's web worker, sql.js + IndexedDB), with this repository as its
// folder; Playwright walks chapter 23's steps 6 to 9 the way a person clicks
// them and takes the chapter's pictures. Modelled on open-steamgate's
// scripts/test-web-probe.mjs and scripts/test-web-tiles.mjs (whose fioriTiles
// this script calls for the greyed tiles, Zork and the WEBGUI).
//
// The web bundle must hold the fleet. Built from an open-steamgate checkout:
//
//   cd $OSD_HOME
//   OSD_PACKS=/path/to/osg-demo OSD_WEB_PACKS=all npm run web:vscode
//   OSD_HOME=$OSD_HOME node /path/to/osg-demo/test/web-shots.mjs
//
// The folder is this repository, as the chapter's
// `npx @vscode/test-web ... --extensionDevelopmentPath ./editors/vscode ../osg-demo`
// opens it. test-web serves a folder read-only (GET only; what VS Code saves
// stays in the browser), and the walk saves nothing: the notebook is the
// untitled one the Data Preview's "Open in SQL notebook" makes. The script
// checks that `git status` of the repository is the same after the walk.
// WEB_SHOTS_FOLDER names another folder.
//
// OSD_WEB_EXT names another extension folder (default $OSD_HOME/editors/vscode),
// OUT_DIR the pictures' folder (default a temporary one, printed at the end).
// WEB_SHOTS_FLEET=0 walks an extension without the fleet (e.g. the Marketplace
// package unzipped, OSD_WEB_EXT=<dir>/extension) over $OSD_HOME as the folder:
// OSG's own table, notebook and tiles.
//
// Each step is PASS, FAIL or KNOWN, and the walk goes on. KNOWN is a failure
// chapter 23 describes at open-steamgate 0.7.3140, in the web entry and not in
// this pack: the OData V4 service is not bridged (/sap/opu/odata4/ is outside
// the webview bridge's paths) and a pack's BSP folder is not bundled, so the
// Voyages app and OSG's own V4 tiles do not open; the V2 binding's draft
// Prepare/Activate answer 400 (on the desktop engine too). A KNOWN step that
// passes is reported as `FAIL ... now works: update chapter 23`. The exit code
// is 1 when any step is FAIL, 0 when all are PASS or KNOWN.
import {spawn} from "node:child_process";
import {mkdir, mkdtemp, rm} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.OSD_HOME ? resolve(process.env.OSD_HOME) : "";
if (!home) {
  console.error("web-shots: set OSD_HOME to an open-steamgate checkout with a web bundle built with this pack");
  process.exit(2);
}
const extension = resolve(process.env.OSD_WEB_EXT ?? join(home, "editors/vscode"));
// WEB_SHOTS_FLEET=0: the extension as published (no osg-demo in its bundle):
// OSG's own table, notebook and tiles only
const fleet = process.env.WEB_SHOTS_FLEET !== "0";
const {chromium} = createRequire(join(home, "package.json"))("@playwright/test");
const {fioriTiles} = await import(pathToFileURL(join(home, "scripts/test-web-tiles.mjs")).href);

const temp = await mkdtemp(join(tmpdir(), "osd-web-shots-"));
const shots = resolve(process.env.OUT_DIR ?? join(temp, "shots"));
await mkdir(shots, {recursive: true});
// the folder VS Code opens: this repository (or OSG's checkout without the fleet)
const workspace = resolve(process.env.WEB_SHOTS_FOLDER ?? (fleet ? repo : home));
const gitStatus = () => { try { return execFileSync("git", ["status", "--porcelain"], {cwd: workspace, encoding: "utf8"}); } catch { return undefined; } };
const statusBefore = gitStatus();

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const results = [];
// known: a failure chapter 23 describes; it is KNOWN while it fails, and a
// FAIL that asks for the chapter to be corrected once it passes
async function step(name, work, known = false) {
  const started = Date.now();
  try {
    const note = await work();
    const verdict = known ? "FAIL" : "PASS";
    const said = known ? `now works: update chapter 23 (${note ?? ""})` : note ?? "";
    results.push({name, verdict, note: said, ms: Date.now() - started});
    console.log(`${verdict} ${name}${said ? `: ${said}` : ""}`);
  } catch (error) {
    const note = String(error?.message ?? error).split("\n").slice(0, 3).join(" | ").slice(0, 600);
    const verdict = known ? "KNOWN" : "FAIL";
    results.push({name, verdict, note, ms: Date.now() - started});
    console.log(`${verdict} ${name}: ${note}`);
    await page?.screenshot({path: join(shots, `${verdict.toLowerCase()}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`)}).catch(() => undefined);
    await page?.keyboard.press("Escape").catch(() => undefined);
  }
}
const shot = async (name) => {
  await sleep(800); // let UI5 finish its busy indicators
  await page.screenshot({path: join(shots, name)});
  return name;
};

async function freePort() {
  const server = createServer();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

async function palette(title) {
  const input = page.locator(".quick-input-widget input").first();
  for (let attempt = 0; ; attempt++) {
    const trust = page.locator(".monaco-dialog-box .monaco-text-button").filter({hasText: /^Cancel$/}).first();
    if (await trust.isVisible().catch(() => false)) await trust.click();
    await page.keyboard.press("Control+Shift+P");
    if (await input.waitFor({timeout: 5000}).then(() => true, () => false)) break;
    if (attempt === 5) throw new Error("the command palette did not open");
    // focus can sit in a webview or nowhere after a reload: give it to the workbench
    await page.locator(".part.statusbar").first().click().catch(() => undefined);
  }
  await input.fill(`>${title}`);
  const choice = page.locator(".quick-input-list .monaco-list-row").filter({hasText: title}).first();
  await choice.waitFor({timeout: 30000});
  await choice.click();
}

// a command that prints `<marker> {json}` to its Output channel
async function command(title, marker) {
  await palette(title);
  await page.waitForFunction((name) => {
    const text = (document.querySelector(".output-view .view-lines")?.textContent ?? "").replaceAll(" ", " ");
    return text.includes(`${name} {`) || text.includes(`${name}_ERROR`);
  }, marker, {timeout: 180000});
  const text = (await page.locator(".output-view .view-lines").textContent()).replaceAll(" ", " ");
  const start = text.lastIndexOf(`${marker} {`);
  if (start < 0) throw new Error(text.slice(-1000));
  for (let end = start + marker.length + 2; end <= text.length; end++) {
    if (text[end - 1] !== "}") continue;
    try { return JSON.parse(text.slice(start + marker.length + 1, end)); } catch { /* go on */ }
  }
  throw new Error(`${marker}: incomplete JSON`);
}

// the webview frame a test function accepts (VS Code nests webviews in frames)
async function frameWhere(test, arg, what, timeout = 180000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      if (await frame.evaluate(test, arg).catch(() => false)) return frame;
    }
    await sleep(500);
  }
  const stats = [];
  for (const frame of page.frames()) {
    const one = await frame.evaluate(() => window.osdBridge?.stats && JSON.stringify({errors: window.osdBridge.stats.errors,
      bridged: window.osdBridge.stats.bridged})).catch(() => undefined);
    if (one) stats.push(one);
  }
  throw new Error(`${what} did not appear; bridge: ${stats.join(" | ").slice(0, 400)}`);
}
const frameWithText = (text, what = text, timeout) => frameWhere((wanted) => (document.body?.innerText ?? "").includes(wanted), text, what, timeout);

// a file by its path, the way a person finds it: the folders in the
// Explorer, one click each, then a double click on the file
async function openPath(path) {
  await page.locator(".activitybar .action-label[aria-label*='Explorer']").first().click();
  const parts = path.split("/");
  for (const [index, name] of parts.entries()) {
    const row = page.locator(".explorer-folders-view .monaco-list-row").filter({has: page.locator(".label-name", {hasText: new RegExp(`^${name.replace(/[.]/g, "\\.")}$`)})}).first();
    await row.waitFor({timeout: 30000});
    await row.scrollIntoViewIfNeeded();
    const last = index === parts.length - 1;
    if (last) await row.dblclick();
    else if (await row.getAttribute("aria-expanded") !== "true") await row.click();
  }
  await page.locator(".editor-instance .monaco-editor").first().waitFor({timeout: 30000});
}

// the untitled notebook asks whether to save it: no
async function closeAll() {
  await palette("View: Close All Editors");
  const dont = page.locator(".monaco-dialog-box .monaco-button").filter({hasText: /Don.t Save/}).first();
  if (await dont.waitFor({timeout: 3000}).then(() => true, () => false)) await dont.click();
}
const isLaunchpad = () => !!window.osdBridge && !!window["sap-ushell-config"];
async function launchpad() {
  const tab = page.locator(".tabs-container .tab").filter({hasText: "Fiori Launchpad"}).first();
  if (await tab.count()) await tab.click();
  else {
    await closeAll();
    await palette("osd: Open Fiori Launchpad");
  }
  const frame = await frameWhere(isLaunchpad, undefined, "Fiori launchpad");
  // an error dialog of an app that did not load is closed first
  const close = frame.locator(".sapMDialog button").filter({hasText: /^Close$/}).first();
  if (await close.isVisible().catch(() => false)) await close.click();
  await frame.evaluate(() => { if (window.location.hash !== "#Shell-home") window.location.hash = "#Shell-home"; });
  await frame.waitForFunction((wanted) => wanted.every((name) => [...document.querySelectorAll(".sapUshellTile")].some((tile) =>
    tile.textContent.includes(name))), fleet ? ["Airship fleet", "Voyages", "Data browser"] : ["Travels", "Data browser"], {timeout: 120000});
  await sleep(500);
  return frame;
}
const bodyHas = (frame, texts, timeout = 120000) => frame.waitForFunction((wanted) =>
  wanted.every((text) => document.body.innerText.includes(text)), texts, {timeout});
const bridgeErrors = (frame) => frame.evaluate(() => JSON.stringify(window.osdBridge?.stats?.errors ?? [])).catch(() => "[]");

// an OData call from a page, through its fetch (the bridge when the URL is the gateway's)
const odataCall = (frame, path, method = "GET", body) => frame.evaluate(async ({path, method, body}) => {
  const service = path.replace(/^(\.\.\/sap\/opu\/odata4?\/sap\/[^/]+\/).*$/, "$1");
  const token = method === "GET" ? undefined
    : (await fetch(service, {headers: {"x-csrf-token": "fetch"}})).headers.get("x-csrf-token");
  const tunnel = method === "MERGE" ? {"x-http-method": "MERGE"} : {};
  const answer = await fetch(path, {method: method === "MERGE" ? "POST" : method, headers: {accept: "application/json",
    "content-type": "application/json", ...tunnel, ...(token ? {"x-csrf-token": token, "if-match": "*"} : {})}, body});
  const text = await answer.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text.slice(0, 300); }
  return {status: answer.status, body: json};
}, {path, method, body});
// what a Fiori app came to: "rows" when a table row holds `text`, else the
// launchpad's error dialog or a timeout
const appOutcome = (frame, text) => frame.waitForFunction((wanted) => {
  const error = /could not be opened|could not be loaded/.exec(document.body.innerText);
  if (error) return `error: App ${error[0]} because the SAP UI5 component of the application could not be loaded`;
  return [...document.querySelectorAll(".sapMListTblRow, .sapUiTableRow, tr")].some((row) => row.textContent.includes(wanted)) ? "rows" : false;
}, text, {timeout: 90000}).then((handle) => handle.jsonValue(), (error) => `timeout: ${error.message.split("\n")[0]}`);

const port = await freePort();
const origin = `http://localhost:${port}`;
let server;
let context;
let page;
let serverOutput = "";
const browserLog = [];
const timings = {};

try {
  server = spawn("npx", ["-y", "@vscode/test-web", "--browser", "none", "--quality", "stable",
    "--extensionDevelopmentPath", extension, "--testRunnerDataDir", process.env.OSD_WEB_TEST_DATA_DIR ?? join(temp, "vscode"),
    "--port", String(port), workspace], {
    cwd: home, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: {...process.env, npm_config_cache: process.env.npm_config_cache ?? join(temp, "npm-cache")},
  });
  for (const stream of [server.stdout, server.stderr]) stream.on("data", (chunk) => { serverOutput = (serverOutput + chunk).slice(-8000); });
  for (const until = Date.now() + 15 * 60000; ; await sleep(1000)) {
    if (server.exitCode !== null) throw new Error(`@vscode/test-web exited: ${serverOutput.slice(-2000)}`);
    if (Date.now() > until) throw new Error(`@vscode/test-web did not start: ${serverOutput.slice(-2000)}`);
    if (await fetch(origin).then((answer) => answer.ok, () => false)) break;
  }
  context = await chromium.launchPersistentContext(join(temp, "profile"), {
    headless: true, args: ["--no-sandbox"], viewport: {width: 1440, height: 900},
  });
  page = context.pages()[0] ?? await context.newPage();
  page.on("console", (message) => browserLog.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => browserLog.push(`pageerror: ${error.message}`));
  const opened = Date.now();
  await page.goto(origin, {waitUntil: "domcontentloaded"});
  await page.locator(".monaco-workbench").waitFor({timeout: 120000});
  timings.workbenchMs = Date.now() - opened;

  await step("activation and the worker's first $metadata", async () => {
    const probe = await command("osd: Web probe", "OSD_WEB_PROBE");
    timings.activationToMetadataMs = probe.activationToMetadataMs;
    timings.commandToMetadataMs = probe.commandToMetadataMs;
    if (probe.metadata !== 200 || probe.post !== 201 || probe.get !== 200) throw new Error(JSON.stringify(probe));
    return `$metadata ${probe.metadata}, POST ${probe.post}, GET ${probe.get}; activation to $metadata ${probe.activationToMetadataMs} ms`;
  });

  await step("OSD view: System and services", async () => {
    await page.locator(".activitybar .action-label[aria-label*='OSD']").first().click();
    const tree = page.locator(".pane-body .monaco-list-row");
    await tree.filter({hasText: "In-browser gateway"}).first().waitFor({timeout: 120000});
    const generation = (await tree.filter({hasText: "Generation:"}).first().textContent()).trim();
    const odata = tree.filter({hasText: /^OData \([1-9]/}).first();
    const groups = (await tree.allTextContents()).map((one) => one.trim()).filter((one) => /^(OData|Apps|ICF|APC) \(/.test(one));
    await odata.click();
    const service = fleet ? "ZOSD_FLEET_SRV" : "ZSTG_DEMO_SRV";
    if (fleet) await tree.filter({hasText: "ZUI_OSD_FLEET_VOY"}).first().waitFor({timeout: 30000});
    await tree.filter({hasText: service}).first().click();
    await frameWithText(service, "service panel", 30000);
    await shot("web-osd-view.png");
    const services = (await tree.allTextContents()).map((one) => one.trim()).filter((one) => /ZOSD_FLEET|FLEET_VOY/.test(one));
    await odata.click(); // collapse, so that Apps is in sight
    await tree.filter({hasText: /^Apps \([1-9]/}).first().click();
    await tree.filter({hasText: fleet ? "osd.fleet" : "stg.travel"}).first().waitFor({timeout: 30000});
    const apps = (await tree.allTextContents()).map((one) => one.trim().split("/")[0]).filter((one) => /^[a-z0-9]+\.[a-z0-9.]+$/.test(one));
    await shot("check-osd-view-apps.png");
    return `${generation}; groups ${groups.join(", ")}; ${fleet ? `fleet services ${services.join(" / ")}; ` : ""}apps ${apps.join(", ")}`;
  });

  // step 7: the ship table, F8, the Data Preview's "Open in SQL notebook"
  const table = fleet ? {path: "src/ddic/zosd_fleet_ship.tabl.xml", name: "ZOSD_FLEET_SHIP", texts: ["SHIP_ID", "Albatross", "Old Boiler"]}
    : {path: "src/ddic/zstg_demo.tabl.xml", name: "ZSTG_DEMO", texts: ["TRAVEL_ID", "T0001"]};
  let preview;
  await step(`F8 Data Preview on ${table.path}`, async () => {
    // the probe's Output panel is not part of step 7: closed, for room
    await palette("View: Hide Panel").catch(() => undefined);
    await openPath(table.path);
    await page.locator(".editor-instance .monaco-editor .view-lines").first().click();
    await page.keyboard.press("F8");
    preview = await frameWithText("Open in SQL notebook", "F8 Data Preview", 60000);
    await bodyHas(preview, table.texts, 30000);
    const title = (await page.locator(".tabs-container .tab").filter({hasText: "Data Preview"}).first().innerText()).trim();
    const status = (await preview.locator("body").innerText()).match(/-- \d+ rows? --/)?.[0];
    await shot("web-data-preview.png");
    if (!title.includes(`Data Preview ${table.name}`)) throw new Error(`tab "${title}"`);
    return `tab "${title}"; ${table.texts.join(", ")}; ${status}`;
  });

  const rows = fleet ? ["SHIP_ID", "Albatross", "Brass Heron", "Old Boiler"] : ["TRAVEL_ID", "T0001"];
  let statement;
  await step("Open in SQL notebook: the SELECT in a cell, run", async () => {
    if (!preview) throw new Error("no Data Preview to press the button in");
    await preview.locator("button#notebook").click();
    // VS Code asks before it renders a notebook's outputs: "Open Notebook"
    const dialog = page.locator(".monaco-dialog-box").filter({hasText: /notebook/i}).first();
    let asked = "no dialog";
    if (await dialog.waitFor({timeout: 10000}).then(() => true, () => false)) {
      asked = `dialog "${(await dialog.innerText()).replace(/\s+/g, " ").trim()}"`;
      await shot("check-notebook-trust.png");
      await dialog.locator(".monaco-button").filter({hasText: "Open Notebook"}).first().click();
    }
    const editor = page.locator(".notebookOverlay").first();
    await editor.waitFor({timeout: 60000});
    const cell = editor.locator(".monaco-list-row").filter({hasText: /SELECT\s+\*\s+FROM/}).first();
    await cell.waitFor({timeout: 30000});
    statement = (await cell.locator(".view-lines").first().innerText()).replace(/\s+/g, " ").trim();
    const tab = (await page.locator(".tabs-container .tab").filter({hasText: ".osdnb"}).first().innerText()).trim();
    // the cell's own Run button (the starter's text: "the cell's Run button or Shift+Enter")
    await cell.hover();
    const run = cell.locator(".run-button-container .action-label, .codicon-notebook-execute").first();
    if (await run.isVisible().catch(() => false)) await run.click();
    else { await cell.locator(".view-lines").click(); await page.keyboard.press("Control+Enter"); }
    const frame = await frameWithText("raw JSON", "the cell's table", 120000);
    await bodyHas(frame, rows, 30000);
    await page.mouse.move(700, 880); // no hover toolbar or tooltip in the picture
    await shot("web-notebook.png");
    return `${asked} -> Open Notebook; tab "${tab}"; cell "${statement}"; ${rows.join(", ")} in the table under the cell`;
  });

  await step("an ABAP cell in the browser", async () => {
    const editor = page.locator(".notebookOverlay").first();
    if (!await editor.count()) throw new Error("no notebook open");
    await editor.locator(".monaco-list-row").filter({hasText: /SELECT\s+\*\s+FROM/}).first().locator(".view-lines").click();
    await palette("Notebook: Insert Code Cell Below");
    await page.keyboard.type("WRITE 'hello'.");
    await palette("Notebook: Change Cell Language");
    const abap = page.locator(".quick-input-list .monaco-list-row").filter({hasText: /^ABAP|\(abap\)/}).first();
    await abap.waitFor({timeout: 30000});
    await abap.click();
    const cell = page.locator(".notebookOverlay .monaco-list-row").filter({hasText: /WRITE/}).first();
    await cell.hover();
    await cell.locator(".run-button-container .action-label").first().click();
    const wanted = "notebook cells are not available in the browser";
    const until = Date.now() + 60000;
    for (;;) {
      const outputs = await page.locator(".notebookOverlay").first().innerText().catch(() => "");
      if (outputs.includes(wanted)) break;
      const frame = await frameWithText(wanted, "the ABAP cell's answer", 2000).catch(() => undefined);
      if (frame) break;
      if (Date.now() > until) throw new Error(`no "${wanted}"`);
    }
    await shot("check-notebook-abap-cell.png");
    return `"abap ${wanted}"`;
  });

  // step 8: the launchpad's Content packs
  await step("launchpad: Content packs", async () => {
    const frame = await launchpad();
    const titles = await frame.evaluate(() => [...document.querySelectorAll(".sapUshellTile")]
      .map((tile) => tile.innerText.split("\n")[0].trim()).filter(Boolean));
    if (!fleet) return `${titles.length} tiles: ${titles.join(", ")}`;
    const tab = frame.locator(".sapUshellAnchorItem, [role=tab], .sapMITBFilter").filter({hasText: "Content packs"}).first();
    await tab.waitFor({timeout: 30000});
    await tab.click();
    await sleep(1500);
    const packs = await frame.evaluate(() => [...document.querySelectorAll(".sapUshellTile")]
      .filter((tile) => /Airship fleet|Voyages/.test(tile.innerText) && tile.getBoundingClientRect().top < window.innerHeight && tile.getBoundingClientRect().bottom > 0)
      .map((tile) => tile.innerText.replace(/\s+/g, " ").trim()));
    await shot("web-launchpad-fleet.png");
    for (const name of ["Airship fleet", "Voyages"]) {
      if (!packs.some((one) => one.startsWith(name) && one.includes("osg-demo"))) throw new Error(`in sight: ${packs.join(" | ")}`);
    }
    return `in sight after "Content packs": ${packs.join(" | ")}; all ${titles.length} tiles: ${titles.join(", ")}`;
  });

  if (fleet) {
    await step("Airship fleet tile: the fleet's rows", async () => {
      const frame = await launchpad();
      await frame.locator(".sapUshellTile").filter({hasText: "Airship fleet"}).first().click();
      await frame.waitForFunction(() => window.location.hash.startsWith("#AirshipFleet-display"), undefined, {timeout: 60000});
      const shown = () => bodyHas(frame, ["Albatross", "Brass Heron"], 60000);
      await shown().catch(async () => {
        await frame.locator("button").filter({hasText: /^Go$/}).first().click();
        await shown();
      });
      await shot("web-fleet.png");
      return `rows Albatross, Brass Heron; bridge errors ${await bridgeErrors(frame)}`;
    });

    // The Voyage service itself, from the launchpad page's own fetch (the
    // bridge the Fiori apps use), whatever the Voyages app does.
    const v4 = "../sap/opu/odata4/sap/ZUI_OSD_FLEET_VOY";
    const v2 = "../sap/opu/odata/sap/ZUI_OSD_FLEET_VOY";
    const v2fleet = "../sap/opu/odata/sap/ZOSD_FLEET_SRV";
    const id = "00000000000000000000000000000003";
    const route = `Tinmere - Port Aurel (web ${Date.now().toString(36).slice(-4).toUpperCase()})`;
    const steam = 7 + (Date.now() % 80);
    await step("Voyage V4 service over the bridge", async () => {
      const frame = await launchpad();
      const list = await odataCall(frame, `${v4}/Voyage?$count=true`);
      if (list.status !== 200) throw new Error(`GET ${v4}/Voyage: HTTP ${list.status} ${JSON.stringify(list.body).slice(0, 200)}`);
      return `$count ${list.body["@odata.count"]}`;
    }, true);
    await step("Voyage V2 binding over the bridge: the seeded voyages", async () => {
      const frame = await launchpad();
      const list = await odataCall(frame, `${v2}/Voyage?$filter=IsActiveEntity%20eq%20true&$orderby=voyage_uuid&$format=json`);
      if (list.status !== 200) throw new Error(`HTTP ${list.status}: ${JSON.stringify(list.body).slice(0, 300)}`);
      const rows = list.body.d.results.map((one) => `${one.ship_id} ${one.route}`);
      if (!["S001", "S002", "S003"].every((ship) => rows.some((row) => row.startsWith(ship)))) throw new Error(rows.join("; "));
      const metadata = await frame.evaluate(async (url) => (await fetch(url)).text(), `${v2}/$metadata`);
      const imports = [...metadata.matchAll(/<FunctionImport Name="([^"]+)"[^>]*>/g)].map((match) => match[1]);
      return `${rows.length} rows: ${rows.join("; ")}; function imports ${imports.join(", ")}`;
    });
    await step("Voyage V2 draft over the bridge: Edit, PATCH route, Prepare, Activate", async () => {
      const frame = await launchpad();
      const keys = (active) => `voyage_uuid='${id}'&IsActiveEntity=${active}`;
      const edit = await odataCall(frame, `${v2}/Edit?${keys(true)}&PreserveChanges=true&$format=json`, "POST");
      if (edit.status !== 200) throw new Error(`Edit ${edit.status}: ${JSON.stringify(edit.body).slice(0, 300)}`);
      const merge = await odataCall(frame, `${v2}/Voyage(voyage_uuid='${id}',IsActiveEntity=false)`, "PATCH", JSON.stringify({route}));
      if (merge.status !== 204) throw new Error(`PATCH ${merge.status}: ${JSON.stringify(merge.body).slice(0, 300)}`);
      const prepare = await odataCall(frame, `${v2}/Prepare?${keys(false)}&$format=json`, "POST");
      const activate = await odataCall(frame, `${v2}/Activate?${keys(false)}&$format=json`, "POST");
      const after = await odataCall(frame, `${v2}/Voyage(voyage_uuid='${id}',IsActiveEntity=true)?$format=json`);
      if (activate.status !== 200 || after.body?.d?.route !== route) {
        const metadata = await frame.evaluate(async (url) => (await fetch(url)).text(), `${v2}/$metadata`);
        const signatures = [...metadata.matchAll(/<FunctionImport Name="(?:Edit|Prepare|Activate)"[\s\S]*?<\/FunctionImport>/g)].map((m) => m[0].replace(/\s+/g, " "));
        const draft = await odataCall(frame, `${v2}/Voyage(voyage_uuid='${id}',IsActiveEntity=false)?$format=json`);
        console.log(`V2 draft detail: edit ${JSON.stringify(edit.body).slice(0, 600)}\nprepare ${JSON.stringify(prepare.body).slice(0, 300)}\ndraft GET ${draft.status} ${JSON.stringify(draft.body).slice(0, 400)}\n${signatures.join("\n")}`);
        throw new Error(`Edit ${edit.status}, PATCH ${merge.status}, Prepare ${prepare.status}, Activate ${activate.status} ${JSON.stringify(activate.body).slice(0, 200)}; active route ${after.body?.d?.route}`);
      }
      return `Edit ${edit.status}, PATCH ${merge.status}, Prepare ${prepare.status}, Activate ${activate.status}: route "${after.body.d.route}"`;
    }, true);
    await step("ZOSD_FLEET_SRV write over the bridge: a ship's steam", async () => {
      const frame = await launchpad();
      const before = await odataCall(frame, `${v2fleet}/ShipSet('S004')?$format=json`);
      if (before.status !== 200) throw new Error(`GET ${before.status}: ${JSON.stringify(before.body).slice(0, 300)}`);
      const ship = {...before.body.d, SteamPct: steam};
      delete ship.__metadata;
      const put = await odataCall(frame, `${v2fleet}/ShipSet('S004')`, "PUT", JSON.stringify(ship));
      if (put.status !== 204) throw new Error(`PUT ${put.status}: ${JSON.stringify(put.body).slice(0, 300)}`);
      return `S004 ${before.body.d.Name}: SteamPct ${before.body.d.SteamPct} -> PUT ${put.status}`;
    });
    await step("reload: the ship's steam is kept (IndexedDB)", async () => {
      await closeAll();
      await page.reload({waitUntil: "domcontentloaded"});
      await page.locator(".monaco-workbench").waitFor({timeout: 120000});
      const frame = await launchpad();
      const ship = await odataCall(frame, `${v2fleet}/ShipSet('S004')?$format=json`);
      const voyage = await odataCall(frame, `${v2}/Voyage(voyage_uuid='${id}',IsActiveEntity=true)?$format=json`);
      await frame.locator(".sapUshellTile").filter({hasText: "Airship fleet"}).first().click();
      await bodyHas(frame, ["Cumulus", String(steam)], 60000).catch(async () => {
        await frame.locator("button").filter({hasText: /^Go$/}).first().click();
        await bodyHas(frame, ["Cumulus", String(steam)], 60000);
      });
      await shot("check-fleet-reloaded.png");
      if (ship.body?.d?.SteamPct !== steam) throw new Error(`S004 SteamPct ${ship.body?.d?.SteamPct}, wrote ${steam}`);
      // the route counts only when the draft step above saved it
      const saved = results.find((one) => one.name.startsWith("Voyage V2 draft"))?.note?.startsWith("now works");
      if (saved && voyage.body?.d?.route !== route) throw new Error(`voyage route ${voyage.body?.d?.route}, saved ${route}`);
      return `after a reload: S004 SteamPct ${steam} (shown in the Airship fleet list); voyage route "${voyage.body?.d?.route}"${saved ? "" : " (no draft was saved to keep)"}`;
    });

    await step("Voyages tile: the V4 list report", async () => {
      const frame = await launchpad();
      await frame.locator(".sapUshellTile").filter({hasText: "Voyages"}).first().click();
      await frame.waitForFunction(() => window.location.hash.startsWith("#Voyage-manage"), undefined, {timeout: 60000});
      const outcome = await appOutcome(frame, "Port Aurel - Cloudhaven");
      await shot("web-voyages-error.png");
      if (outcome !== "rows") throw new Error(`${outcome}; console: ${browserLog.filter((line) => /voyage|odata4/i.test(line)).slice(-3).join(" | ").slice(0, 500)}`);
      return "the seeded voyages in the list";
    }, true);
  }

  for (const [tile, text] of [["OData V4 Travels", "T0001"], ["Draft Trips", "Trip"]]) {
    await step(`OSG's own V4 tile: ${tile}`, async () => {
      const frame = await launchpad();
      await frame.locator(".sapUshellTile").filter({hasText: tile}).first().click();
      const outcome = await appOutcome(frame, text);
      await shot(`check-osg-${tile.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`);
      if (outcome !== "rows") throw new Error(`${outcome}; console: ${browserLog.filter((line) => /odata4/i.test(line)).slice(-2).join(" | ").slice(0, 400)}`);
      return `rows with ${text}`;
    }, true);
  }

  await step("OSG tiles: Workbench and AMDP greyed, Zork, WEBGUI", async () => {
    await launchpad();
    const tiles = await fioriTiles(page, {shots, fioriFrame: (_page, test, arg, what, timeout) => frameWhere(test, arg, what, timeout),
      packs: ["zork"], survey: true, only: ["Workbench", "AMDP sandbox", "Zork I", "WEBGUI"]});
    const failed = tiles.filter((tile) => tile.after.startsWith("FAIL"));
    const note = tiles.map((tile) => `${tile.tile}: ${tile.after}`).join("; ");
    if (failed.length) throw new Error(note);
    return note;
  });
} catch (error) {
  results.push({name: "harness", verdict: "FAIL", note: String(error?.stack ?? error).slice(0, 1500)});
  console.error(error);
} finally {
  await context?.close().catch(() => undefined);
  if (server?.pid && server.exitCode === null) {
    try { process.kill(-server.pid, "SIGTERM"); } catch { /* gone */ }
    await sleep(500);
  }
  // everything but the pictures (which are in temp when OUT_DIR is unset)
  for (const part of ["profile", "vscode", "npm-cache"]) await rm(join(temp, part), {recursive: true, force: true});
  if (process.env.OUT_DIR) await rm(temp, {recursive: true, force: true});
}
// the folder was VS Code's workspace: nothing of the walk may have landed in it
if (statusBefore !== undefined) {
  const after = gitStatus();
  const same = after === statusBefore;
  results.push({name: "the folder is unchanged (git status)", verdict: same ? "PASS" : "FAIL",
    note: same ? `${workspace.split("/").pop()}: ${statusBefore.trim().split("\n").filter(Boolean).length} entries before and after` : `before:\n${statusBefore}after:\n${after}`});
}
console.log(`\ntimings: ${JSON.stringify(timings)}`);
console.log(`pictures: ${shots}`);
for (const one of results) console.log(`${one.verdict} ${one.name} (${one.ms ?? 0} ms)${one.note ? ` -- ${one.note}` : ""}`);
const count = (verdict) => results.filter((one) => one.verdict === verdict).length;
console.log(`\n${count("PASS")} PASS, ${count("KNOWN")} KNOWN, ${count("FAIL")} FAIL`);
if (count("FAIL")) {
  console.log(`browser log (last 25):\n${browserLog.slice(-25).join("\n")}`);
  process.exitCode = 1;
}
