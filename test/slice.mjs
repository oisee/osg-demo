// End-to-end check of the Airship fleet first slice (docs/fleet-contract.md,
// "First joint slice"), against a real open-steamgate engine.
//
// Run it from anywhere, pointing at an engine checkout:
//
//   OSD_HOME=<open-steamgate checkout> node test/slice.mjs
//
// The engine checkout needs `npm install && npm run bootstrap` done once.
// Its main branch is enough for these checks: the tile opens the pack's page
// at /app/osg-demo/. The BSP copy of the app (/sap/bc/ui5_ui5/sap/zosg_demo/)
// loads data only with the engine's pack-app manifest rebase, open-steamgate
// branch `vg/pack-manifest-rebase` until it is merged.
//
// What it does:
//  1. builds the engine with this repository as a pack (OSD_PACKS=<this repo>,
//     `npm run transpile` in OSD_HOME), so no check runs against a stale build;
//  2. starts the engine on STG_PORT (default: a free port), keeps its PID and
//     stops only that PID at the end, also when a check fails;
//  3. makes one assertion per item of the slice:
//     1. ShipSet/$count is the number of ships in the seed (6);
//     2. POST /sap/bc/adt/oo/classrun/ZCL_OSD_FLEET_REPORT prints a line for S001;
//     3. ShipSet?$filter=Status eq 'A' returns exactly the seed's aloft ships;
//     4. a MERGE on ShipSet('S002') reads back with the new value (then restored);
//     5. the "Airship fleet" tile on the launchpad opens the list report at
//        /app/osg-demo/, which shows the six ship names (Playwright from the
//        engine's node_modules; SAPUI5 comes from ui5.sap.com, so the browser
//        needs to reach it);
//     6. ABAP Unit of ZCL_OSD_FLEET_REPORT (ltcl_fleet) is green.
//
// and the README chapters after the slice (chapter 4's check is item 5):
//     7. ch2: transaction ZOSD_FLEET (WEBGUI) shows the six report lines;
//     8. ch2: with negative steam on a ship the classrun dumps in steam_check
//        (ASSERTION_FAILED), and prints again once the value is restored;
//     9. ch3: the value help StatusVHSet('A') answers Aloft, and the voyages of
//        S001 and S006 through ShipSet(..)/Voyages match the seed.
//
// SLICE_SKIP_UI=1 skips item 5 and says so; nothing else is skippable.
// SLICE_CHROMIUM=<path> launches that Chromium instead of the one the
// engine's Playwright expects (for a machine with a different build).
import {spawn, spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {createServer} from "node:net";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.OSD_HOME;
if (home === undefined || home === "") {
  console.error("slice: set OSD_HOME to an open-steamgate checkout");
  process.exit(2);
}
const seed = (table) => JSON.parse(readFileSync(join(repo, "data", `${table}.tabu.json`), "utf8"));
const ships = seed("zosd_fleet_ship");

const freePort = () => new Promise((ok, fail) => {
  const probe = createServer().listen(0, "127.0.0.1", () => {
    const {port} = probe.address();
    probe.close(() => ok(port));
  }).on("error", fail);
});
const port = Number(process.env.STG_PORT || await freePort());
const base = `http://localhost:${port}`;
const odata = `${base}/sap/opu/odata/sap/ZOSD_FLEET_SRV`;
const env = {...process.env, OSD_PACKS: repo, STG_PORT: String(port)};

const results = [];
let server;

function stop() {
  if (server?.pid !== undefined && server.exitCode === null) {
    try {
      process.kill(server.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}
process.on("exit", stop);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stop();
    process.exit(130);
  });
}

async function check(name, body) {
  try {
    const detail = await body();
    results.push({name, ok: true, detail});
    console.log(`ok    ${name}${detail ? ` -- ${detail}` : ""}`);
  } catch (e) {
    results.push({name, ok: false, detail: e.message});
    console.log(`FAIL  ${name} -- ${e.message}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(url) {
  const res = await fetch(url, {headers: {accept: "application/json"}});
  expect(res.ok, `${url}: HTTP ${res.status}`);
  return (await res.json()).d;
}

/** A CSRF token and its session cookie, the way a client fetches them. */
async function csrf(url) {
  const res = await fetch(url, {headers: {"x-csrf-token": "fetch"}});
  const token = res.headers.get("x-csrf-token");
  expect(token, `${url}: no CSRF token`);
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return {"x-csrf-token": token, cookie};
}

// 1. build: the pack is compiled into a fresh generation
console.log(`slice: building ${home} with OSD_PACKS=${repo}`);
const build = spawnSync("npm", ["run", "-s", "transpile"], {cwd: home, env, stdio: ["ignore", "ignore", "inherit"]});
if (build.status !== 0) {
  console.error(`slice: npm run transpile failed (${build.status})`);
  process.exit(1);
}

// 2. start the engine and wait for the service
server = spawn(process.execPath, ["test/run.mjs"], {cwd: home, env, stdio: ["ignore", "ignore", "inherit"]});
console.log(`slice: engine PID ${server.pid} on port ${port}`);
const deadline = Date.now() + 180_000;
for (;;) {
  expect(server.exitCode === null, `the engine exited with ${server.exitCode}`);
  const ready = await fetch(`${odata}/$metadata`).then((r) => r.ok, () => false);
  if (ready) break;
  if (Date.now() > deadline) {
    console.error("slice: the engine did not serve ZOSD_FLEET_SRV within 180 s");
    process.exit(1);
  }
  await new Promise((ok) => setTimeout(ok, 1000));
}

// 3. the six items
await check("1 tables + seed: ShipSet/$count", async () => {
  const res = await fetch(`${odata}/ShipSet/$count`);
  expect(res.ok, `HTTP ${res.status}`);
  const count = Number(await res.text());
  expect(count === ships.length && count === 6, `expected ${ships.length} (6), got ${count}`);
  // a page of two still counts every ship, as the list report's title does
  const page = await json(`${odata}/ShipSet?$top=2&$inlinecount=allpages`);
  expect(page.results.length === 2 && Number(page.__count) === count,
    `$top=2&$inlinecount=allpages: ${page.results.length} rows, __count ${page.__count}`);
  return `${count} ships, a page of 2 counts ${page.__count}`;
});

await check("2 classrun ZCL_OSD_FLEET_REPORT prints S001", async () => {
  const headers = await csrf(`${base}/sap/bc/adt/discovery`);
  const res = await fetch(`${base}/sap/bc/adt/oo/classrun/ZCL_OSD_FLEET_REPORT`, {method: "POST", headers});
  const text = await res.text();
  expect(res.ok, `HTTP ${res.status}: ${text.slice(0, 200)}`);
  const line = text.split(/\r?\n/).find((l) => l.startsWith("S001 "));
  expect(line !== undefined, `no line for S001 in:\n${text}`);
  return line;
});

await check("3 ShipSet?$filter=Status eq 'A'", async () => {
  const d = await json(`${odata}/ShipSet?$filter=${encodeURIComponent("Status eq 'A'")}`);
  const got = d.results.map((s) => s.ShipId).sort();
  const want = ships.filter((s) => s.status === "A").map((s) => s.ship_id).sort();
  expect(want.length > 0, "the seed has no aloft ship");
  expect(JSON.stringify(got) === JSON.stringify(want), `expected ${want}, got ${got}`);
  expect(d.results.every((s) => s.Status === "A" && s.StatusText === "Aloft"), "a row is not A / Aloft");
  return got.join(", ");
});

await check("4 MERGE ShipSet('S002') reads back", async () => {
  const url = `${odata}/ShipSet('S002')`;
  const before = await json(url);
  const changed = before.SteamPct === 42 ? 43 : 42;
  const headers = {...await csrf(`${odata}/`), "content-type": "application/json", accept: "application/json"};
  const merge = (value) => fetch(url, {method: "MERGE", headers, body: JSON.stringify({SteamPct: value})});
  const res = await merge(changed);
  expect(res.status === 204, `MERGE: HTTP ${res.status} ${await res.text()}`);
  try {
    const after = await json(url);
    expect(after.SteamPct === changed, `SteamPct is ${after.SteamPct}, expected ${changed}`);
    expect(after.Name === before.Name, `MERGE changed Name to ${after.Name}`);
  } finally {
    await merge(before.SteamPct);
  }
  return `SteamPct ${before.SteamPct} -> ${changed} -> ${before.SteamPct}`;
});

if (process.env.SLICE_SKIP_UI === "1") {
  results.push({name: "5 tile -> list report", ok: true, skipped: true});
  console.log("SKIP  5 tile -> list report -- SLICE_SKIP_UI=1");
} else {
  await check("5 tile -> list report shows the six ships", async () => {
    const {chromium} = createRequire(join(home, "package.json"))("playwright");
    const browser = await chromium.launch(process.env.SLICE_CHROMIUM ? {executablePath: process.env.SLICE_CHROMIUM} : {});
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${base}/app/flp.html`, {waitUntil: "domcontentloaded"});
      // a tile whose URL is not an intent may open in this tab or in a new
      // one; follow whichever happens
      const tile = page.getByText("Airship fleet", {exact: true}).first();
      await tile.waitFor({timeout: 90_000});
      const [app] = await Promise.all([
        Promise.race([
          page.context().waitForEvent("page", {timeout: 90_000}),
          page.waitForURL(/\/app\/osg-demo\//, {timeout: 90_000}).then(() => page),
        ]),
        tile.click(),
      ]);
      if (app !== page) app.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      await app.waitForLoadState("domcontentloaded");
      const names = ships.map((s) => s.name);
      for (const name of names) {
        await app.getByText(name, {exact: true}).first().waitFor({timeout: 90_000});
      }
      expect(new URL(app.url()).pathname.startsWith("/app/osg-demo/"), `the tile went to ${app.url()}`);
      return `${names.length} rows: ${names.join(", ")}${errors.length ? ` (console errors: ${errors.length})` : ""}`;
    } finally {
      await browser.close();
    }
  });
}

await check("6 ABAP Unit ltcl_fleet", async () => {
  const headers = {...await csrf(`${base}/sap/bc/adt/discovery`), "content-type": "application/xml"};
  const res = await fetch(`${base}/sap/bc/adt/abapunit/testruns`, {method: "POST", headers, body:
`<?xml version="1.0" encoding="UTF-8"?>
<aunit:runConfiguration xmlns:aunit="http://www.sap.com/adt/aunit" xmlns:adtcore="http://www.sap.com/adt/core">
  <external><coverage active="false"/></external>
  <adtcore:objectReferences>
    <adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/zcl_osd_fleet_report"/>
  </adtcore:objectReferences>
</aunit:runConfiguration>`});
  const xml = await res.text();
  expect(res.ok, `HTTP ${res.status}`);
  expect(/testClass adtcore:name="LTCL_FLEET"/.test(xml), "no LTCL_FLEET in the run result");
  expect(/testMethod adtcore:name="COUNTS_VOYAGES"/.test(xml), "COUNTS_VOYAGES did not run");
  expect(!/<alert[\s>]/.test(xml), `the run has alerts:\n${xml}`);
  return "counts_voyages passed";
});

await check("7 ch2 transaction ZOSD_FLEET", async () => {
  const res = await fetch(`${base}/sap/bc/gui/sap/its/webgui/?okcode=ZOSD_FLEET`);
  const html = await res.text();
  expect(res.ok, `HTTP ${res.status}`);
  expect(html.includes('data-transaction="ZOSD_FLEET - Airship fleet"'), "the screen is not titled ZOSD_FLEET - Airship fleet");
  const missing = ships.filter((s) => !html.includes(`${s.ship_id} ${s.name} (`));
  expect(missing.length === 0, `no line for ${missing.map((s) => s.ship_id)}`);
  return `${ships.length} lines on the screen`;
});

await check("8 ch2 negative steam dumps in steam_check", async () => {
  const url = `${odata}/ShipSet('S004')`;
  const before = (await json(url)).SteamPct;
  const headers = {...await csrf(`${odata}/`), "content-type": "application/json"};
  const merge = (value) => fetch(url, {method: "MERGE", headers, body: JSON.stringify({SteamPct: value})});
  const classrun = async () => {
    const adt = await csrf(`${base}/sap/bc/adt/discovery`);
    return (await fetch(`${base}/sap/bc/adt/oo/classrun/ZCL_OSD_FLEET_REPORT`, {method: "POST", headers: adt})).text();
  };
  expect((await merge(-5)).status === 204, "MERGE -5 failed");
  let dumped;
  try {
    dumped = await classrun();
  } finally {
    await merge(before);
  }
  expect(/ASSERTION_FAILED/.test(dumped) && dumped.includes("ASSERT iv_steam_pct >= 0."), `no assertion dump in:\n${dumped}`);
  expect(!/^S00\d /m.test(dumped), "ship lines were printed despite the dump");
  const again = await classrun();
  expect(/^S004 /m.test(again), "the report does not print after the restore");
  return "ASSERTION_FAILED, then clean after restoring";
});

await check("9 ch3 value help and Ship/Voyages", async () => {
  const vh = await json(`${odata}/StatusVHSet('A')`);
  expect(vh.Status === "A" && vh.Text === "Aloft", `StatusVHSet('A') is ${JSON.stringify(vh)}`);
  const voyages = seed("zosd_fleet_voy");
  for (const id of ["S001", "S006"]) {
    const got = (await json(`${odata}/ShipSet('${id}')/Voyages`)).results.map((v) => v.VoyageId).sort();
    const want = voyages.filter((v) => v.ship_id === id).map((v) => v.voyage_id).sort();
    expect(JSON.stringify(got) === JSON.stringify(want), `${id}/Voyages: ${got} instead of ${want}`);
  }
  return "A Aloft; S001 and S006 voyages as seeded";
});

stop();
const failed = results.filter((r) => !r.ok);
const skipped = results.filter((r) => r.skipped);
console.log(`slice: ${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
process.exit(failed.length === 0 ? 0 : 1);
