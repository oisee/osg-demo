// Chapter 23: open-steamgate in the real https://vscode.dev, in headless
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
// After the install it walks chapter 23's steps 2 to 4: the OSD view; the
// launchpad (Workbench and AMDP sandbox grey, Travels with rows); osd: Web
// probe, Developer: Reload Window, osd: Web verify last Travel (the probe's
// Travel read back after the reload, from IndexedDB). The probe's and the
// verify's output lines are printed as they are.
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
// the last `<marker> {...}` line of the Output view, as printed
async function outputLine(marker, timeout = 120000) {
  await page.waitForFunction((name) => {
    const text = (document.querySelector(".output-view .view-lines")?.textContent ?? "").replaceAll("\u00a0", " ");
    return text.includes(`${name} {`) || text.includes(`${name}_ERROR`);
  }, marker, {timeout});
  const lines = await page.locator(".output-view .view-lines .view-line").allTextContents();
  const text = lines.map((line) => line.replaceAll("\u00a0", " ")).join("\n");
  const start = Math.max(text.lastIndexOf(`${marker} {`), text.lastIndexOf(`${marker}_ERROR`));
  // a long line wraps into several view lines: up to the end of the JSON
  const rest = text.slice(start).replace(/\n/g, "");
  for (let end = rest.indexOf("{") + 1; end <= rest.length; end++) {
    if (rest[end - 1] !== "}") continue;
    try { JSON.parse(rest.slice(rest.indexOf("{"), end)); return rest.slice(0, end); } catch { /* go on */ }
  }
  return rest.slice(0, 600);
}
const launchpadFrame = async () => {
  for (const frame of page.frames()) {
    if (await frame.evaluate(() => !!window["sap-ushell-config"] && document.querySelectorAll(".sapUshellTile").length > 0).catch(() => false)) return frame;
  }
  return undefined;
};

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
  const openedAt = Date.now();
  const ready = await step("open https://vscode.dev", async () => {
    await page.goto("https://vscode.dev/", {waitUntil: "domcontentloaded", timeout: 120000});
    await page.locator(".monaco-workbench").waitFor({timeout: 120000});
    timings.workbenchMs = Date.now() - openedAt;
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

  await step("what opened after the install (editor tabs)", async () => {
    const tabs = (await page.locator(".tabs-container .tab").allInnerTexts()).map((one) => one.replace(/\s+/g, " ").trim());
    const defaults = await page.getByText("Start with the defaults").first().isVisible().catch(() => false);
    return `tabs: ${tabs.join(" | ")}; "Start with the defaults" in sight: ${defaults}`;
  });

  // step 3: the launchpad
  await step("Fiori launchpad", async () => {
    await palette("osd: Open Fiori Launchpad", "osd: Open Fiori Launchpad");
    const until = Date.now() + 180000;
    let frame;
    while (!(frame = await launchpadFrame())) {
      if (Date.now() > until) throw new Error("no launchpad tiles");
      await sleep(1000);
    }
    await sleep(1500);
    const tiles = await frame.evaluate(() => [...document.querySelectorAll(".sapUshellTile")].map((tile) => tile.innerText.replace(/\s+/g, " ").trim()));
    await shot(`vscodedev-${mode}-launchpad-home.png`);
    return `${tiles.length} tiles: ${tiles.map((tile) => tile.slice(0, 60)).join(" | ")}`;
  });
  if (mode === "marketplace") {
    await step("launchpad: Workbench and AMDP sandbox grey", async () => {
      const frame = await launchpadFrame();
      const grey = await frame.evaluate(() => Object.fromEntries([...document.querySelectorAll(".sapUshellTile")]
        .filter((tile) => /^(Workbench|AMDP sandbox)/.test(tile.innerText.trim()))
        .map((tile) => [tile.innerText.split("\n")[0].trim(), {text: tile.innerText.replace(/\s+/g, " ").trim(), link: !!tile.querySelector("a[href]")}])));
      const workbench = grey.Workbench?.text ?? "";
      const amdp = grey["AMDP sandbox"]?.text ?? "";
      if (!/needs the ADT facade/.test(workbench) || !/SQLScript engine here|speaks it/.test(amdp)) throw new Error(JSON.stringify(grey));
      return `Workbench: "${workbench}"; AMDP sandbox: "${amdp}"`;
    });
    await step("Travels tile: a list report with rows", async () => {
      const frame = await launchpadFrame();
      await frame.locator(".sapUshellTile").filter({hasText: /^Travels/}).first().click();
      const rows = () => frame.waitForFunction(() => [...document.querySelectorAll(".sapMListTblRow, tr")].some((row) => /T0001/.test(row.textContent)), undefined, {timeout: 60000});
      await rows().catch(async () => {
        await frame.locator("button").filter({hasText: /^Go$/}).first().click();
        await rows();
      });
      const count = await frame.evaluate(() => /\w+ \((\d+)\)/.exec(document.body.innerText)?.[0]);
      await shot(`vscodedev-${mode}-travels.png`);
      await frame.evaluate(() => { window.location.hash = "#Shell-home"; });
      return `rows with T0001; header "${count}"`;
    });
  }

  // step 4: probe, reload, verify
  await step("osd: Web probe (activation to the first $metadata)", async () => {
    await palette("osd: Web probe", /^osd: Web probe$/);
    const line = await outputLine("OSD_WEB_PROBE");
    const ms = /"activationToMetadataMs":(\d+)/.exec(line)?.[1];
    timings.activationToMetadataMs = Number(ms);
    console.log(`  output: ${line}`);
    if (!/"metadata":200,"post":201,"get":200/.test(line)) throw new Error(line);
    await shot(`vscodedev-${mode}-probe.png`);
    return `activation to $metadata ${ms} ms; ${/"metadata":\d+,"post":\d+,"get":\d+/.exec(line)?.[0]}`;
  });
  if (mode === "marketplace") {
    await step("Developer: Reload Window, then osd: Web verify last Travel", async () => {
      await palette("Developer: Reload Window", /^Developer: Reload Window$/);
      await sleep(3000);
      await page.locator(".monaco-workbench").waitFor({timeout: 120000});
      await page.locator(".activitybar .action-label[aria-label*='OSD']").first().waitFor({timeout: 120000});
      await sleep(2000);
      await palette("osd: Web verify last Travel", "osd: Web verify last Travel");
      const line = await outputLine("OSD_WEB_VERIFY");
      console.log(`  output: ${line}`);
      await shot(`vscodedev-${mode}-verify.png`);
      if (!/^OSD_WEB_VERIFY \{"get":200/.test(line)) throw new Error(line);
      return line;
    });
  }

  // the book's fleet, when the installed bundle carries osg-demo
  let launchpad;
  if (mode === "location") {
    // back to the launchpad's tab, after the probe's Output
    await page.locator(".tabs-container .tab").filter({hasText: "Fiori Launchpad"}).first().click().catch(() => undefined);
    await sleep(1000);
  }
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
