// Chapter 22: open-steamgate in the real https://vscode.dev, in headless
// Chromium, without an account. Two ways in:
//
//   marketplace  the Extensions view: search, Install (and trust the publisher)
//   location     Developer: Install Extension From Location... with a local
//                https://localhost:<port> (open-steamgate's
//                scripts/serve-vscode-web.mjs over a staged web extension)
//
//   OSD_HOME=<open-steamgate checkout> node test/web-vscodedev.mjs marketplace
//   OSD_HOME=<...> node test/web-vscodedev.mjs location https://localhost:5000
//
// Each step is printed as PASS or FAIL, with a picture under OUT_DIR
// (default a temporary folder). Nothing is signed in; the browser profile is
// temporary and removed at the end. The location route stands in for what a
// person does once in a visible browser: Chrome's "allow access to the local
// network" is granted in advance (to vscode.dev; WEB_VSCODEDEV_LNA=all to
// every origin, which the webviews need), and the self-signed certificate is
// trusted (--ignore-certificate-errors), as after mkcert.
import {mkdir, mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";

const home = process.env.OSD_HOME ? resolve(process.env.OSD_HOME) : "";
const [mode = "marketplace", location = "https://localhost:5000"] = process.argv.slice(2);
if (!home || !["marketplace", "location"].includes(mode)) {
  console.error("usage: OSD_HOME=<open-steamgate checkout> node test/web-vscodedev.mjs marketplace|location [https://localhost:<port>]");
  process.exit(2);
}
const {chromium} = createRequire(join(home, "package.json"))("@playwright/test");
const temp = await mkdtemp(join(tmpdir(), "osd-vscodedev-"));
const shots = resolve(process.env.OUT_DIR ?? join(temp, "shots"));
await mkdir(shots, {recursive: true});
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const results = [];
const log = [];
let page;
async function step(name, work) {
  const started = Date.now();
  try {
    const note = await work();
    results.push({name, ok: true, note: note ?? "", ms: Date.now() - started});
    console.log(`PASS ${name}${note ? `: ${note}` : ""}`);
    return true;
  } catch (error) {
    const note = String(error?.message ?? error).split("\n").slice(0, 3).join(" | ").slice(0, 600);
    results.push({name, ok: false, note, ms: Date.now() - started});
    console.log(`FAIL ${name}: ${note}`);
    await page?.screenshot({path: join(shots, `fail-${mode}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`)}).catch(() => undefined);
    return false;
  }
}
const shot = async (name) => { await sleep(800); await page.screenshot({path: join(shots, name)}); return name; };
async function palette(title, pick = title) {
  await page.keyboard.press("Control+Shift+P");
  const input = page.locator(".quick-input-widget input").first();
  await input.waitFor({timeout: 30000});
  await input.fill(`>${title}`);
  const choice = page.locator(".quick-input-list .monaco-list-row").filter({hasText: pick}).first();
  await choice.waitFor({timeout: 30000});
  await choice.click();
}
// Install's dialogs (the publisher's trust, "limited functionality in VS Code
// for the Web"), answered as they come, until the OSD view is in the Activity
// Bar; returns the dialogs' texts
async function installed(timeout = 180000) {
  const seen = [];
  const osd = page.locator(".activitybar .action-label[aria-label*='OSD']").first();
  for (const until = Date.now() + timeout; Date.now() < until; await sleep(1000)) {
    if (await osd.isVisible().catch(() => false)) return seen;
    const dialog = page.locator(".monaco-dialog-box").first();
    if (await dialog.isVisible().catch(() => false)) {
      const button = dialog.getByRole("button", {name: /Install Anyway|Trust Publisher|^Trust|^Install/}).first();
      if (await button.isVisible().catch(() => false)) {
        seen.push((await dialog.innerText()).replace(/\s+/g, " ").slice(0, 300));
        await page.screenshot({path: join(shots, `vscodedev-${mode}-dialog-${seen.length}.png`)});
        await button.click();
      }
    }
  }
  throw new Error(`no OSD view after ${timeout} ms; dialogs: ${seen.join(" || ")}`);
}

const context = await chromium.launchPersistentContext(join(temp, "profile"), {
  headless: true, ignoreHTTPSErrors: true, viewport: {width: 1440, height: 900},
  // location route: the self-signed localhost certificate counts as trusted,
  // as after mkcert or "accept the certificate once" (docs/vscode-web.md);
  // the webviews' service worker does not get Playwright's ignoreHTTPSErrors
  args: ["--no-sandbox", ...(mode === "location" ? ["--ignore-certificate-errors"] : [])],
});
const timings = {};
// Chrome asks the person once whether vscode.dev may reach the local network
// (a loopback address); headless, nobody answers and the fetch is denied.
// For the location route the answer "Allow" is given in advance: to
// vscode.dev, and with WEB_VSCODEDEV_LNA=all to every origin (the webviews'
// *.vscode-cdn.net frames load the extension's files from localhost too).
if (mode === "location") {
  const all = process.env.WEB_VSCODEDEV_LNA === "all";
  await context.grantPermissions(["local-network-access"], all ? {} : {origin: "https://vscode.dev"})
    .then(() => console.log(`local-network-access granted to ${all ? "every origin" : "https://vscode.dev"}`),
      (error) => console.log(`local-network-access not grantable here: ${String(error.message).split("\n")[0]}`));
}
try {
  page = context.pages()[0] ?? await context.newPage();
  page.on("console", (message) => log.push(`${message.type()}: ${message.text()}`));
  // failed and refused requests, by URL (the webviews' frames included)
  context.on("requestfailed", (request) => log.push(`error: request failed ${request.url().slice(0, 160)} ${request.failure()?.errorText}`));
  context.on("response", (response) => { if (response.status() >= 400) log.push(`error: HTTP ${response.status()} ${response.url().slice(0, 160)}`); });
  const opened = Date.now();
  const ready = await step("open https://vscode.dev", async () => {
    await page.goto("https://vscode.dev/", {waitUntil: "domcontentloaded", timeout: 120000});
    await page.locator(".monaco-workbench").waitFor({timeout: 120000});
    timings.workbenchMs = Date.now() - opened;
    return `workbench in ${timings.workbenchMs} ms`;
  });
  if (!ready) throw new Error("vscode.dev did not open");

  const started = Date.now();
  if (mode === "marketplace") {
    await step("Extensions view: search, the open-steamgate entry", async () => {
      await page.keyboard.press("Control+Shift+X");
      await page.getByText("Search Extensions in Marketplace").first().waitFor({timeout: 60000});
      await sleep(1000); // the search box has the focus once the view is open
      await page.keyboard.type("oisee.open-steamgate", {delay: 20});
      const entry = page.locator(".monaco-list-row").filter({hasText: "open-steamgate"}).first();
      await entry.waitFor({timeout: 60000});
      await shot("vscodedev-marketplace-search.png");
      return (await entry.innerText()).replace(/\s+/g, " ").slice(0, 200);
    });
    await step("Install (trust the publisher)", async () => {
      const entry = page.locator(".monaco-list-row").filter({hasText: "open-steamgate"}).first();
      await entry.locator(".extension-action, .monaco-button").filter({hasText: /^Install$/}).first().click();
      const dialogs = await installed();
      timings.installToViewMs = Date.now() - started;
      return `OSD in the Activity Bar after ${timings.installToViewMs} ms; dialogs: ${dialogs.join(" || ")}`;
    });
  } else {
    await step(`Install Extension From Location: ${location}`, async () => {
      await palette("Developer: Install Extension From Location", "Install Extension From Location");
      const input = page.locator(".quick-input-widget input").first();
      await input.waitFor({timeout: 30000});
      await input.fill(location);
      await page.keyboard.press("Enter");
      const dialogs = await installed();
      timings.installToViewMs = Date.now() - started;
      return `OSD in the Activity Bar after ${timings.installToViewMs} ms; dialogs: ${dialogs.join(" || ")}`;
    });
  }

  await step("OSD view: the in-browser gateway", async () => {
    await page.locator(".activitybar .action-label[aria-label*='OSD']").first().click();
    const tree = page.locator(".pane-body .monaco-list-row");
    await tree.filter({hasText: "In-browser gateway"}).first().waitFor({timeout: 180000});
    await tree.filter({hasText: /^OData \([1-9]/}).first().waitFor({timeout: 180000});
    const rows = (await tree.allTextContents()).map((one) => one.trim());
    await shot(`vscodedev-${mode}-osd-view.png`);
    return rows.join(" / ").slice(0, 400);
  });

  await step("osd: Web probe (activation to the first $metadata)", async () => {
    await palette("osd: Web probe", /^osd: Web probe$/);
    await page.waitForFunction(() => (document.querySelector(".output-view .view-lines")?.textContent ?? "").replaceAll("\u00a0", " ").includes("OSD_WEB_PROBE {"), undefined, {timeout: 120000});
    const text = (await page.locator(".output-view .view-lines").textContent()).replaceAll(" ", " ");
    const ms = /"activationToMetadataMs":(\d+)/.exec(text)?.[1];
    timings.activationToMetadataMs = Number(ms);
    return `activation to $metadata ${ms} ms; ${/"metadata":\d+,"post":\d+,"get":\d+/.exec(text)?.[0]}`;
  });

  await step("Fiori launchpad", async () => {
    await palette("osd: Open Fiori Launchpad", "osd: Open Fiori Launchpad");
    const until = Date.now() + 180000;
    for (;;) {
      let titles;
      for (const frame of page.frames()) {
        titles = await frame.evaluate(() => window["sap-ushell-config"] &&
          [...document.querySelectorAll(".sapUshellTile")].map((tile) => tile.innerText.split("\n")[0].trim())).catch(() => undefined);
        if (titles?.length) break;
      }
      if (titles?.length) {
        await shot(`vscodedev-${mode}-launchpad.png`);
        return `${titles.length} tiles: ${titles.join(", ")}`;
      }
      if (Date.now() > until) throw new Error("no launchpad tiles");
      await sleep(1000);
    }
  });

  // the book's fleet, when the installed bundle carries osg-demo
  let launchpad;
  for (const frame of page.frames()) {
    if (await frame.evaluate(() => [...document.querySelectorAll(".sapUshellTile")].some((tile) => tile.innerText.includes("Airship fleet"))).catch(() => false)) launchpad = frame;
  }
  if (launchpad) {
    await step("Airship fleet tile", async () => {
      await launchpad.locator(".sapUshellTile").filter({hasText: "Airship fleet"}).first().click();
      const rows = () => launchpad.waitForFunction(() => document.body.innerText.includes("Albatross") && document.body.innerText.includes("Brass Heron"), undefined, {timeout: 60000});
      await rows().catch(async () => {
        await launchpad.locator("button").filter({hasText: /^Go$/}).first().click();
        await rows();
      });
      await shot(`vscodedev-${mode}-fleet.png`);
      return "rows Albatross, Brass Heron";
    });
  }
} catch (error) {
  results.push({name: "harness", ok: false, note: String(error?.message ?? error)});
} finally {
  await context.close().catch(() => undefined);
  await rm(join(temp, "profile"), {recursive: true, force: true});
}
console.log(`\ntimings: ${JSON.stringify(timings)}\npictures: ${shots}`);
if (results.some((one) => !one.ok)) {
  console.log(`browser log (errors, last 15):\n${log.filter((line) => /^error/.test(line)).slice(-15).join("\n").slice(0, 4000)}`);
  process.exitCode = 1;
}
