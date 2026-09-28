// End-to-end check of the Airship fleet first slice (docs/fleet-contract.md,
// "First joint slice"), against a real open-steamgate engine.
//
// Run it from anywhere, pointing at an engine checkout:
//
//   OSD_HOME=<open-steamgate checkout> node test/slice.mjs
//
// The engine checkout needs `npm install && npm run bootstrap` done once.
// Its main branch at 0ba17ed (oisee/open-steamgate#173) or later: the tile
// opens the intent #AirshipFleet-display, which the launchpad resolves from
// the pack's manifest to the app's BSP copy (/sap/bc/ui5_ui5/sap/zosg_demo/).
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
//     5. the "Airship fleet" tile on the launchpad opens the list report by
//        the intent #AirshipFleet-display, inside the launchpad, and it shows
//        the six ship names (Playwright from the
//        engine's node_modules; SAPUI5 comes from ui5.sap.com, so the browser
//        needs to reach it);
//     6. ABAP Unit of ZCL_OSD_FLEET_REPORT (ltcl_fleet) is green.
//
// and the README chapters after the slice (chapter 4's check is item 5):
//     7. ch2: transaction ZOSD_FLEET (WEBGUI) shows the six report lines;
//     8. ch2: with negative steam on a ship the classrun dumps in steam_check
//        (ASSERTION_FAILED), and prints again once the value is restored;
//     9. ch3: the value help StatusVHSet('A') answers Aloft, and the voyages of
//        S001 and S006 through ShipSet(..)/Voyages match the seed;
//    10. ch7: segw:zip of this folder refuses exactly the two local objects,
//        and of a copy without them carries every object the deploy unit
//        lists and no seed rows (docs/take-to-system.md);
//    11. ch5: the cube service ZC_OSD_FLEETCUBE_CDS answers one row per
//        voyage, and $filter on the ship gives that ship's voyages;
//    12. ch6: ZCL_OSD_FLEET_FUEL's classrun prints fuel per 100 km per ship,
//        computed from the seed, on DuckDB or HANA (STG_DB=duckdb|hana), and
//        says it needs one of them on SQLite;
//    12a. ch6: ZCL_OSD_FLEET_SUMMARY includes the ship without voyages and
//         reconciles the AMDP rows with independent Open SQL reads;
//    13. ch2: the classic ALV report ZOSD_FLEET_ALV, run as transaction
//        ZGUI_OSD_FLEET_ALV, shows a grid of the six ships with their status
//        texts.
//
// SLICE_SKIP_UI=1 skips item 5 and says so; nothing else is skippable.
// SLICE_CHROMIUM=<path> launches that Chromium instead of the one the
// engine's Playwright expects (for a machine with a different build).
import {spawn, spawnSync} from "node:child_process";
import {cpSync, existsSync, mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
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

await check("1a F8 Data Preview: fleet tables and CDS", async () => {
  const definitions = [
    {route: "ddic", key: "ddicEntityName", name: "ZOSD_FLEET_SHIP", rows: ships.length, sample: "Albatross"},
    {route: "ddic", key: "ddicEntityName", name: "ZOSD_FLEET_VOY", rows: seed("zosd_fleet_voy").length, sample: "V00001"},
    {route: "ddic", key: "ddicEntityName", name: "ZOSD_FLEET_STAT", rows: seed("zosd_fleet_stat").length, sample: "Aloft"},
    {route: "cds", key: "ddlSourceName", name: "ZC_OSD_FLEETCUBE", rows: seed("zosd_fleet_voy").length, sample: "V00001"},
  ];
  const headers = await csrf(`${base}/sap/bc/adt/discovery`);
  for (const {route, key, name, rows, sample} of definitions) {
    const url = `${base}/sap/bc/adt/datapreview/${route}?rowNumber=100&${key}=${name}`;
    const res = await fetch(url, {method: "POST", headers, body: ""});
    const xml = await res.text();
    expect(res.ok, `${name}: HTTP ${res.status}: ${xml.slice(0, 200)}`);
    expect(xml.includes(`<dataPreview:totalRows>${rows}</dataPreview:totalRows>`), `${name}: expected ${rows} rows`);
    expect(xml.includes(`<dataPreview:data>${sample}</dataPreview:data>`), `${name}: missing ${sample}`);
  }
  return "6 ships, 20 voyages, 3 statuses, 20 cube rows";
});

await check("1b fleet audit result and ABAP Unit", async () => {
  const headers = await csrf(`${base}/sap/bc/adt/discovery`);
  const run = await fetch(`${base}/sap/bc/adt/oo/classrun/ZCL_OSD_FLEET_AUDIT`, {method: "POST", headers});
  const output = await run.text();
  expect(run.ok, `classrun: HTTP ${run.status}: ${output.slice(0, 200)}`);
  expect(output.includes("Fleet audit OK: 6 ships, 20 voyages"), `unexpected audit output: ${output}`);

  const unit = await fetch(`${base}/sap/bc/adt/abapunit/testruns`, {method: "POST",
    headers: {...headers, "content-type": "application/xml"},
    body: `<?xml version="1.0" encoding="UTF-8"?>
<aunit:runConfiguration xmlns:aunit="http://www.sap.com/adt/aunit" xmlns:adtcore="http://www.sap.com/adt/core">
  <external><coverage active="false"/></external>
  <adtcore:objectReferences>
    <adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/zcl_osd_fleet_audit"/>
  </adtcore:objectReferences>
</aunit:runConfiguration>`});
  const xml = await unit.text();
  expect(unit.ok, `ABAP Unit: HTTP ${unit.status}`);
  expect(/testMethod adtcore:name="SEEDED_FLEET"/.test(xml), "seeded audit test did not run");
  expect(/testMethod adtcore:name="MISMATCH_IS_ERROR"/.test(xml), "failure-path audit test did not run");
  expect(!/<alert[\s>]/.test(xml), `audit has alerts:\n${xml}`);
  return "6 ships, 20 voyages; success and mismatch paths passed";
});

await check("1b1 fleet BAL: two success logs and one error", async () => {
  const headers = await csrf(`${base}/sap/bc/adt/discovery`);
  const run = await fetch(`${base}/sap/bc/adt/oo/classrun/ZCL_OSD_FLEET_BAL`, {method: "POST", headers});
  const written = await run.text();
  expect(run.ok, `BAL classrun: HTTP ${run.status}: ${written.slice(0, 200)}`);
  const batch = /BAL batch ([A-F0-9]{32}): 2 success, 1 error/.exec(written)?.[1];
  expect(batch, `BAL writer failed: ${written}`);

  const view = await fetch(`${base}/sap/bc/adt/oo/classrun/ZCL_OSD_FLEET_BAL_VIEW`,
    {method: "POST", headers: await csrf(`${base}/sap/bc/adt/discovery`)});
  const shown = await view.text();
  expect(view.ok, `BAL viewer: HTTP ${view.status}: ${shown.slice(0, 200)}`);
  for (const suffix of ["OK1", "OK2", "ERR"]) {
    expect(shown.includes(`Run ${batch}-${suffix};`), `BAL viewer lacks ${suffix}: ${shown}`);
  }
  expect((shown.match(/1 S Fleet audit started/g) ?? []).length === 3, `BAL start items: ${shown}`);
  expect((shown.match(/2 I Observed 6 ships and 20 voyages/g) ?? []).length === 3,
    `BAL count items: ${shown}`);
  expect((shown.match(/3 S Fleet audit OK: 6 ships, 20 voyages/g) ?? []).length === 2,
    `BAL success items: ${shown}`);
  expect(shown.includes("3 E Fleet audit failed: 6 ships, 20 voyages; expected 7 and 20"),
    `BAL error item: ${shown}`);

  const unit = await fetch(`${base}/sap/bc/adt/abapunit/testruns`, {method: "POST",
    headers: {...await csrf(`${base}/sap/bc/adt/discovery`), "content-type": "application/xml"},
    body: `<?xml version="1.0" encoding="UTF-8"?>
<aunit:runConfiguration xmlns:aunit="http://www.sap.com/adt/aunit" xmlns:adtcore="http://www.sap.com/adt/core">
  <external><coverage active="false"/></external>
  <adtcore:objectReferences>
    <adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/zcl_osd_fleet_bal"/>
  </adtcore:objectReferences>
</aunit:runConfiguration>`});
  const xml = await unit.text();
  expect(unit.ok, `BAL ABAP Unit: HTTP ${unit.status}`);
  expect(/testMethod adtcore:name="ERROR_FILTER_READS_MESSAGES"/.test(xml), "BAL filter test did not run");
  expect(!/<alert[\s>]/.test(xml), `BAL test has alerts:\n${xml}`);
  return "3 persisted logs, 9 ordered messages, error filter ABAP Unit green";
});

await check("1c service tree: chapter labels", async () => {
  const res = await fetch(`${base}/sap/bc/adt/core/http/services`);
  expect(res.ok, `service tree: HTTP ${res.status}`);
  const {services} = await res.json();
  const labels = new Map(services.map((s) => [s.path, s.text]));
  for (const [path, label] of [
    ["/sap/opu/odata/sap/ZOSD_FLEET_SRV", "osg-demo Ch3: ships and voyages (OData)"],
    ["/app/flp.html#AirshipFleet-display", "osg-demo Ch4: Airship fleet app"],
    ["/sap/opu/odata/sap/ZC_OSD_FLEETCUBE_CDS", "osg-demo Ch5: voyage cube by ship and month"],
  ]) expect(labels.get(path) === label, `${path}: ${labels.get(path) ?? "missing"}`);
  const transactions = await fetch(`${base}/sap/bc/adt/core/http/transactions`);
  expect(transactions.ok, `transaction tree: HTTP ${transactions.status}`);
  const inventory = (await transactions.json()).transactions;
  const fleet = inventory.find((t) => t.tcode === "ZOSD_FLEET");
  expect(fleet?.text === "osg-demo Ch2: fleet report", `ZOSD_FLEET: ${fleet?.text ?? "missing"}`);
  return "chapters 2, 3, 4 and 5 labelled";
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
      const context = await browser.newContext();
      const page = await context.newPage();
      // Console errors from SAPUI5 itself are common and not ours; they are
      // printed for the record. What fails the check is ours: an HTTP error
      // on this pack's app, its BSP copy or its service, or a console error
      // that names them.
      const ours = /\/app\/osg-demo\/|\/sap\/bc\/ui5_ui5\/sap\/zosg_demo\/|\/ZOSD_FLEET_SRV\//i;
      // what SAPUI5 asks every app for and does without: the component
      // preload and the flexibility bundles of an app with no preload. A
      // BSP on a system answers them the same way.
      const uiProbe = /\/(Component-preload\.js|changes\/(changes|flexibility)-bundle\.json)(\?|$)/;
      const errors = [];
      const failures = [];
      const listen = (p) => {
        p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
        p.on("pageerror", (e) => errors.push(e.message));
      };
      listen(page);
      context.on("page", listen);
      context.on("response", (r) => {
        if (r.status() >= 400 && r.url().startsWith(base) && ours.test(r.url()) && !uiProbe.test(r.url())) failures.push(`${r.status()} ${r.url()}`);
      });
      await page.goto(`${base}/app/flp.html`, {waitUntil: "domcontentloaded"});
      // the tile's URL is the launchpad's own intent, so it stays in the
      // shell: same tab, the hash changes, the app is embedded
      const tile = page.getByText("Airship fleet", {exact: true}).first();
      await tile.waitFor({timeout: 90_000});
      await Promise.all([
        page.waitForURL(/#AirshipFleet-display/, {timeout: 90_000}),
        tile.click(),
      ]);
      const app = page;
      const names = ships.map((s) => s.name);
      for (const name of names) {
        await app.getByText(name, {exact: true}).first().waitFor({timeout: 90_000});
      }
      expect(new URL(app.url()).pathname === "/app/flp.html" && app.url().includes("#AirshipFleet-display"),
        `the tile went to ${app.url()}`);
      await app.waitForLoadState("networkidle").catch(() => {});
      for (const e of errors) console.log(`      console error: ${e.replace(/\s+/g, " ").slice(0, 200)}`);
      const named = errors.filter((e) =>
        (ours.test(e) || /ZOSD_FLEET|osd\.fleet/.test(e)) &&
        !/resource osd\/fleet\/changes\/(?:changes|flexibility)-bundle\.json could not be loaded/.test(e));
      expect(failures.length === 0, `HTTP errors on this pack: ${failures.join("; ")}`);
      expect(named.length === 0, `console errors naming this pack: ${named.join(" | ").slice(0, 400)}`);
      return `${names.length} rows: ${names.join(", ")}; ${errors.length} console errors, none of them this pack's`;
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

await check("10 ch7 segw:zip carries the unit, not the local objects", async () => {
  const work = mkdtempSync(join(tmpdir(), "osg-slice-zip-"));
  try {
    const zip = (from, out) => spawnSync(process.execPath, ["tools/osd-abapgit-zip.mjs", from, "--unit", "osg-demo",
      "--manifest", join(repo, "deploy", "manifest.json"), "--out", out], {cwd: home, encoding: "utf8"});
    const refused = zip(repo, join(work, "refused.zip"));
    const said = refused.stdout + refused.stderr;
    expect(refused.status !== 0 && !existsSync(join(work, "refused.zip")), "the unstaged folder was zipped");
    const keys = [...said.matchAll(/^  ([A-Z]{4} \S+)  \(/gm)].map((m) => m[1]);
    const refusedKeys = [...new Set(keys)].sort().join(", ");
    expect(refusedKeys === "CLAS ZCL_OSD_FLEET_TRAN, TRAN ZOSD_FLEET", `refused: ${refusedKeys || said.slice(0, 300)}`);

    const stage = join(work, "osg-demo");
    cpSync(repo, stage, {recursive: true, filter: (p) => !/[\\/]\.git([\\/]|$)/.test(p)
      && !/zcl_osd_fleet_tran\.clas\.|zosd_fleet\.tran\.xml$/.test(p)});
    const made = zip(stage, join(work, "osg-demo.zip"));
    expect(made.status === 0, `staged zip failed: ${(made.stdout + made.stderr).slice(0, 300)}`);
    // what the tool says it carried, one "<TYPE> <name>" per object: CLAS,
    // TABL ... list names with ", "; IWSV/IWMO add a version and SICF a node
    // id after the name, which the key drops
    const carried = new Set();
    for (const [, type, names] of made.stdout.matchAll(/^  ([A-Z]{4})  (.+)$/gm)) {
      const list = ["IWSV", "IWMO", "SICF"].includes(type) ? [names.trim().split(/\s+/)[0]] : names.split(/,\s*/);
      for (const name of list) carried.add(`${type} ${name.trim().toUpperCase()}`);
    }
    const key = (o) => {
      const [type, name] = o.split(" ");
      return `${type} ${(type === "SICF" ? name.split("/").filter(Boolean).pop() : name).toUpperCase()}`;
    };
    const listed = new Set(JSON.parse(readFileSync(join(repo, "deploy", "manifest.json"), "utf8")).units["osg-demo"].objects.map(key));
    const missing = [...listed].filter((k) => !carried.has(k));
    const extra = [...carried].filter((k) => !listed.has(k));
    expect(missing.length === 0 && extra.length === 0, `not carried: ${missing.join(", ") || "-"}; carried but not listed: ${extra.join(", ") || "-"}`);
    const unpaired = ["ship", "stat", "voy"].filter((t) => !made.stdout.includes(`NOT carried: zosd_fleet_${t}.tabu.json`));
    expect(unpaired.length === 0 && ![...carried].some((k) => k.startsWith("DATA ")), `no "NOT carried" line for: ${unpaired.join(", ")}`);
    return `refuses ${refusedKeys}; staged copy carries exactly the ${listed.size} listed objects, no seed rows`;
  } finally {
    rmSync(work, {recursive: true, force: true});
  }
});

await check("11 ch5 cube ZC_OSD_FLEETCUBE_CDS", async () => {
  const cube = `${base}/sap/opu/odata/sap/ZC_OSD_FLEETCUBE_CDS/ZC_OSD_FLEETCUBE`;
  const voyages = seed("zosd_fleet_voy");
  const all = (await json(`${cube}?$format=json`)).results;
  expect(all.length === voyages.length, `${all.length} rows, the seed has ${voyages.length} voyages`);
  const byId = new Map(voyages.map((v) => [v.voyage_id, v]));
  const wrong = all.filter((r) => {
    const v = byId.get(r.VOYAGEID);
    return v === undefined || r.SHIPID !== v.ship_id || r.DEPMONTH !== v.dep_month
      || r.PASSENGERS !== v.passengers || r.FUELKG !== v.fuel_kg || r.DISTANCEKM !== v.distance_km;
  });
  expect(wrong.length === 0, `rows unlike the seed: ${wrong.map((r) => r.VOYAGEID).join(", ")}`);
  const s001 = (await json(`${cube}?$filter=${encodeURIComponent("SHIPID eq 'S001'")}&$format=json`)).results;
  const want = voyages.filter((v) => v.ship_id === "S001").length;
  expect(s001.length === want && s001.every((r) => r.SHIPID === "S001"), `S001 filter: ${s001.length} rows, want ${want}`);
  return `${all.length} voyage rows as seeded; S001 has ${s001.length}`;
});

await check("12 ch6 AMDP fuel per 100 km", async () => {
  const headers = await csrf(`${base}/sap/bc/adt/discovery`);
  const res = await fetch(`${base}/sap/bc/adt/oo/classrun/ZCL_OSD_FLEET_FUEL`, {method: "POST", headers});
  const text = await res.text();
  expect(res.ok, `HTTP ${res.status}`);
  const db = process.env.STG_DB ?? "sqlite";
  if (db !== "duckdb" && db !== "hana") {
    expect(text.includes("AMDP needs DuckDB or HANA; this system runs on sqlite."), `on ${db}:\n${text}`);
    return `on ${db}: says it needs DuckDB or HANA (run with STG_DB=duckdb for the numbers)`;
  }
  const totals = new Map();
  for (const v of seed("zosd_fleet_voy").filter((x) => x.distance_km > 0)) {
    const t = totals.get(v.ship_id) ?? {fuel: 0, km: 0};
    totals.set(v.ship_id, {fuel: t.fuel + v.fuel_kg, km: t.km + v.distance_km});
  }
  const lines = [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([ship, t]) =>
    `${ship}: ${t.fuel} kg over ${t.km} km = ${(Math.round(t.fuel * 10000 / t.km) / 100).toFixed(2)} kg/100 km`);
  const missing = lines.filter((l) => !text.includes(l));
  expect(missing.length === 0, `missing: ${missing.join(" | ")}\nin:\n${text}`);
  return `on ${db}: ${lines.length} ships as computed from the seed`;
});

await check("12a ch6 AMDP summary versus Open SQL", async () => {
  const headers = await csrf(`${base}/sap/bc/adt/discovery`);
  const res = await fetch(`${base}/sap/bc/adt/oo/classrun/ZCL_OSD_FLEET_SUMMARY`, {method: "POST", headers});
  const output = await res.text();
  expect(res.ok, `HTTP ${res.status}: ${output.slice(0, 200)}`);
  const db = process.env.STG_DB ?? "sqlite";
  if (db !== "duckdb" && db !== "hana") {
    expect(output.includes("AMDP needs DuckDB or HANA; this system runs on sqlite."), `on ${db}:\n${output}`);
    return `on ${db}: says it needs DuckDB or HANA`;
  }
  expect(output.includes("checked against Open SQL"), `missing reconciliation heading:\n${output}`);
  expect(!output.includes("MISMATCH"), `AMDP and Open SQL disagree:\n${output}`);
  const voyages = seed("zosd_fleet_voy");
  for (const ship of ships) {
    const rows = voyages.filter((v) => v.ship_id === ship.ship_id);
    const pax = rows.reduce((n, v) => n + v.passengers, 0);
    const km = rows.reduce((n, v) => n + v.distance_km, 0);
    const line = `${ship.ship_id} ${ship.status}: ${rows.length} voyages, ${pax} passengers, ${km} km`;
    expect(output.includes(line), `missing ${line}:\n${output}`);
  }
  expect(output.includes(`MATCH: ${ships.length} ships`), `missing final match:\n${output}`);
  return `on ${db}: ${ships.length} AMDP rows match Open SQL and the seed`;
});

await check("13 ch2 classic ALV ZGUI_OSD_FLEET_ALV", async () => {
  const res = await fetch(`${base}/sap/bc/gui/sap/its/webgui/?okcode=ZGUI_OSD_FLEET_ALV`);
  const page = await res.text();
  expect(res.ok, `HTTP ${res.status}: ${page.slice(0, 200)}`);
  // the page embeds the report's document escaped, twice over in places;
  // unescape it and drop the markup to read the grid as text
  let text = page;
  for (let i = 0; i < 2; i++) {
    text = text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  }
  text = text.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " | ").replace(/(\s*\|\s*)+/g, " | ");
  expect(text.includes(`${ships.length} rows`), "no row count of the grid");
  for (const h of ["SHIP_ID", "NAME", "STATUS", "TEXT", "STEAM_PCT", "HOME_PORT"]) expect(text.includes(` ${h} `), `no column ${h}`);
  const texts = new Map(seed("zosd_fleet_stat").map((s) => [s.status, s.text]));
  const missing = ships.filter((s) => !text.includes(` ${s.ship_id} | ${s.name} | ${s.status} | ${texts.get(s.status)} | ${s.steam_pct} | ${s.home_port} `));
  expect(missing.length === 0, `rows missing or wrong: ${missing.map((s) => s.ship_id).join(", ")}`);
  return `${ships.length} rows with status texts`;
});

stop();
const failed = results.filter((r) => !r.ok);
const skipped = results.filter((r) => r.skipped);
console.log(`slice: ${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
process.exit(failed.length === 0 ? 0 : 1);
