// Takes the book's screenshots from a running engine, into book/img/:
//
//   OSD_HOME=<open-steamgate checkout> node test/book-shots.mjs
//
// Builds the engine with this repository as a pack, starts it on a free
// port, writes one BAL batch (ZCL_OSD_FLEET_BAL) so the log grid has rows,
// and photographs the launchpad, the Fiori app and three WEBGUI screens with
// the engine's own Playwright Chromium. From the "Voyages" tile (chapter 21)
// it takes the list report of the seeded voyages, the object page of the
// Port Aurel - Cloudhaven voyage, and the same page in edit mode with a third
// port being added to the draft, which it then discards. The Fiori shots need
// a browser that reaches ui5.sap.com. Stops the engine it started.
//
// STG_PORT=<port> starts the engine there (default: a free port).
// BOOK_SHOTS_ONLY=webgui,fiori,voyages takes those groups only.
import {spawn, spawnSync} from "node:child_process";
import {mkdirSync, mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {createServer} from "node:net";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.OSD_HOME ? resolve(process.env.OSD_HOME) : "";
if (!home) {
  console.error("book-shots: set OSD_HOME to an open-steamgate checkout");
  process.exit(2);
}
const out = join(repo, "book", "img");
mkdirSync(out, {recursive: true});
const port = Number(process.env.STG_PORT || await new Promise((ok, fail) => {
  const probe = createServer().listen(0, "127.0.0.1", () => {
    const {port: free} = probe.address();
    probe.close(() => ok(free));
  }).on("error", fail);
}));
const base = `http://localhost:${port}`;
// a fresh SQLite file, so the log grid shows this run's batch and nothing older
const dir = mkdtempSync(join(tmpdir(), "osg-demo-shots-"));
const env = {...process.env, OSD_PACKS: repo, STG_PORT: String(port), STG_DB: "file",
  STG_DB_PATH: join(dir, "business.sqlite"), OSD_OPERATIONS_DB: join(dir, "operations.sqlite")};

console.log(`book-shots: building ${home} with OSD_PACKS=${repo}`);
if (spawnSync("npm", ["run", "-s", "transpile"], {cwd: home, env, stdio: ["ignore", "ignore", "inherit"]}).status !== 0) {
  console.error("book-shots: npm run transpile failed");
  rmSync(dir, {recursive: true, force: true});
  process.exit(1);
}
const server = spawn(process.execPath, ["test/run.mjs"], {cwd: home, env, stdio: ["ignore", "ignore", "inherit"]});
const stop = () => {
  if (server.exitCode === null) server.kill("SIGTERM");
  rmSync(dir, {recursive: true, force: true});
};
process.on("exit", stop);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));
for (let i = 0; ; i++) {
  if (await fetch(`${base}/sap/bc/adt/discovery`).then((r) => r.ok, () => false)) break;
  if (i > 180 || server.exitCode !== null) {
    console.error("book-shots: the engine did not come up");
    process.exit(1);
  }
  await new Promise((ok) => setTimeout(ok, 1000));
}

// one BAL batch, so the log grid has something to show
const token = await fetch(`${base}/sap/bc/adt/discovery`, {headers: {"x-csrf-token": "fetch"}});
const written = await fetch(`${base}/sap/bc/adt/oo/classrun/ZCL_OSD_FLEET_BAL`, {method: "POST", headers: {
  "x-csrf-token": token.headers.get("x-csrf-token"),
  cookie: (token.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; "),
}}).then((r) => r.text());
if (!/BAL batch [A-F0-9]{32}: 2 success, 1 error/.test(written)) {
  console.error(`book-shots: the BAL batch was not written: ${written.slice(0, 200)}`);
  process.exit(1);
}

const {chromium} = createRequire(join(home, "package.json"))("playwright");
const browser = await chromium.launch(process.env.SLICE_CHROMIUM ? {executablePath: process.env.SLICE_CHROMIUM} : {});
const page = await browser.newPage({viewport: {width: 1280, height: 760}});
const settle = async (ms = 2500) => {
  await page.mouse.move(1270, 750);
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => document.activeElement?.blur?.()).catch(() => {});
  await page.waitForTimeout(ms);
};
const shot = async (name, clip) => {
  await page.screenshot({path: join(out, `${name}.png`), ...(clip ? {clip} : {})});
  console.log(`book-shots: ${name}.png`);
};
const webgui = async (name, okcode, height = 740) => {
  await page.goto(`${base}/sap/bc/gui/sap/its/webgui/?okcode=${okcode}`, {waitUntil: "networkidle"});
  // fold the decorative side pane away, so the screen gets the whole width
  const fold = page.getByText("\u00ab", {exact: true}).first();
  const folded = await fold.isVisible().catch(() => false);
  if (folded) await fold.click().catch(() => {});
  await settle();
  await shot(name, {x: 0, y: 0, width: folded ? 1280 : 870, height});
};

const steps = [
  // WEBGUI first: it needs no network
  ["webgui", () => webgui("webgui-fleet-report", "ZOSD_FLEET", 290)],
  ["webgui", () => webgui("webgui-fleet-alv", "ZGUI_OSD_FLEET_ALV", 560)],
  ["webgui", () => webgui("webgui-bal-alv", "ZGUI_OSD_FLEET_BALV", 680)],
  // the launchpad, its tile, and the Fiori app behind it (needs ui5.sap.com)
  ["fiori", async () => {
    await page.goto(`${base}/app/flp.html`, {waitUntil: "networkidle", timeout: 120000});
    const tile = page.getByText("Airship fleet").first();
    await tile.scrollIntoViewIfNeeded();
    await settle(1000);
    // the pack's own tile only: the tiles around it depend on the local setup
    const box = await tile.boundingBox();
    await shot("launchpad-tile", {x: Math.max(0, box.x - 32), y: Math.max(0, box.y - 32), width: 240, height: 240});
    await tile.click();
    await page.getByText("Albatross").first().waitFor({timeout: 120000});
    await settle(3000);
    await shot("fiori-list-report");
    await page.getByText("Albatross").first().click();
    await page.waitForURL(/ShipSet\('S001'\)/, {timeout: 60000});
    await settle(4000);
    await shot("fiori-object-page");
  }],
  // chapter 21: the voyages app, a draft-enabled RAP business object over V4
  ["voyages", async () => {
    const v4 = `${base}/sap/opu/odata4/sap/ZUI_OSD_FLEET_VOY`;
    const voyage = (active, path = "") => fetch(
      `${v4}/Voyage(voyage_uuid='00000000000000000000000000000001',IsActiveEntity=${active})${path}`,
      {headers: {accept: "application/json"}}).then(async (r) => (r.ok ? r.json() : null));
    // a state of the server, polled: a field typed in sap.fe reaches the
    // draft only when the field is left
    const until = async (what, timeout = 60000) => {
      for (const end = Date.now() + timeout; ; await new Promise((ok) => setTimeout(ok, 500))) {
        if (await what()) return;
        if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      }
    };
    await page.goto(`${base}/app/flp.html`, {waitUntil: "networkidle", timeout: 120000});
    const tile = page.locator(".sapUshellTile", {has: page.locator('a[href$="#Voyage-manage"]')});
    await tile.click();
    for (const route of ["Port Aurel - Cloudhaven", "Cloudhaven - Tinmere - Port Aurel"]) {
      await page.getByText(route, {exact: true}).first().waitFor({timeout: 120000});
    }
    await page.waitForLoadState("networkidle");
    // sap.fe puts the focus on its first control; a click on the empty page takes it away
    const unfocus = () => page.mouse.click(1100, 700);
    await settle(1000);
    await unfocus();
    await shot("voyage-list-report");
    await page.getByText("Port Aurel - Cloudhaven", {exact: true}).first().click();
    // the active voyage by its semantic key: #Voyage-manage&/Voyage('<uuid>')
    await page.waitForURL(/\/Voyage\((voyage_uuid=)?'0+1'\)/, {timeout: 60000});
    const ports = page.locator("table").filter({hasText: "Cloudhaven"}).last();
    await ports.getByText("Port Aurel", {exact: true}).waitFor({timeout: 60000});
    await page.waitForLoadState("networkidle");
    await settle(1000);
    await unfocus();
    await shot("voyage-object-page");
    // Edit: a draft of the voyage; a third port below it, Tinmere
    await page.getByRole("button", {name: "Edit"}).click();
    // the URL keeps the semantic key; the draft shows in the footer (Save, Discard Draft)
    await page.getByRole("button", {name: "Save"}).waitFor({timeout: 60000});
    await until(async () => (await voyage(false)) !== null);
    await page.getByRole("button", {name: "Create"}).locator("visible=true").first().click();
    // sap.fe puts the new row on top of the table, with order 0
    const field = "input.sapMInputBaseInner";
    const row = page.locator("table tbody tr").filter({has: page.locator(field)}).locator("visible=true").first();
    const [order, port] = [row.locator(field).first(), row.locator(field).last()];
    await port.waitFor({timeout: 30000});
    // sap.fe shows the new row before the draft's stop exists, and a value
    // typed then is lost (test/rap.mjs meets the same): type until it stays
    const landed = async () => ((await voyage(false, "/to_Stops"))?.value ?? [])
      .some((s) => s.port_name === "Tinmere" && s.stop_order === 3);
    await until(async () => {
      await order.fill("3");
      await order.press("Tab");
      await port.fill("Tinmere");
      await port.press("Tab");
      for (let i = 0; i < 8; i++) {
        if (await landed()) return true;
        await new Promise((ok) => setTimeout(ok, 500));
      }
      return false;
    });
    await until(async () => (await voyage(false))?.steam_needed === 45);
    // the field shows it once sap.fe has read it again (Common.SideEffects)
    await page.getByText("45", {exact: true}).locator("visible=true").first().waitFor({timeout: 60000});
    // no settle(): in edit mode sap.fe answers Escape with its Discard popover
    await page.mouse.move(1270, 650);
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.waitForLoadState("networkidle");
    await page.getByText(/^Updating draft/).waitFor({state: "hidden", timeout: 60000});
    await page.getByText("Draft updated").locator("visible=true").waitFor({timeout: 60000});
    await page.waitForTimeout(500);
    await shot("voyage-draft-edit");
    // Discard: the draft goes, the active voyage keeps its two ports
    await page.getByRole("button", {name: "Discard Draft"}).click();
    await page.getByRole("button", {name: "Discard", exact: true}).click();
    await page.getByRole("button", {name: "Edit"}).waitFor({timeout: 60000});
    await until(async () => (await voyage(false)) === null);
    const kept = await voyage(true, "?$expand=to_Stops");
    if (kept.steam_needed !== 35 || kept.to_Stops.length !== 2) {
      throw new Error(`the discard saved something: ${JSON.stringify(kept).slice(0, 300)}`);
    }
  }],
];
const only = (process.env.BOOK_SHOTS_ONLY ?? "").split(",").filter(Boolean);
let failed = 0;
try {
  for (const [kind, step] of steps) {
    if (only.length > 0 && !only.includes(kind)) continue;
    try {
      await step();
    } catch (e) {
      failed++;
      console.error(`book-shots: ${kind} shot failed: ${e.message.split("\n")[0]}`);
    }
  }
} finally {
  await browser.close();
  stop();
}
process.exit(failed === 0 ? 0 : 1);
