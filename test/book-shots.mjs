// Takes the book's screenshots from a running engine, into book/img/:
//
//   OSD_HOME=<open-steamgate checkout> node test/book-shots.mjs
//
// Builds the engine with this repository as a pack, starts it on a free
// port, writes one BAL batch (ZCL_OSD_FLEET_BAL) so the log grid has rows,
// and photographs the launchpad, the Fiori app and three WEBGUI screens with
// the engine's own Playwright Chromium. The Fiori shots need a browser that
// reaches ui5.sap.com. Stops the engine it started.
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
const port = await new Promise((ok, fail) => {
  const probe = createServer().listen(0, "127.0.0.1", () => {
    const {port: free} = probe.address();
    probe.close(() => ok(free));
  }).on("error", fail);
});
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
];
let failed = 0;
try {
  for (const [kind, step] of steps) {
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
