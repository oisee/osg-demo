// End-to-end check of the fleet's RAP business object (book chapter 21),
// against a real open-steamgate engine, in the style of test/slice.mjs.
//
//   OSD_HOME=<open-steamgate checkout> node test/rap.mjs
//
// The engine checkout needs `npm ci && npm run bootstrap` done once. What it
// does:
//  1. builds the engine with this repository as a pack (OSD_PACKS=<this repo>,
//     `npm run transpile` in OSD_HOME), so no check runs against a stale build;
//     if OSD_HOME is an installed system (chapter 24, tools/fleet-system.mjs
//     --install), without OSD_PACKS: the system's digest supplies the fleet
//     (test/engine.mjs);
//  2. runs the ABAP Unit of ZCL_OSD_FLEET_VOYAGE_EML (node tools/osd-unit.mjs),
//     the EML statements of chapter 21 against the managed runtime;
//  3. starts the engine on a throwaway database (STG_DB_PATH under the system
//     temp dir, removed at the end) and checks the service over OData V4:
//     a. $metadata has Voyage and Stop with the draft key, the flags, the
//        bound draft actions and Common.DraftRoot / DraftNode;
//     b. the three seeded voyages answer with their stops ($expand=to_Stops)
//        and the steam the rule computes for them;
//     c. a draft is created (POST), a stop is added below it (POST through
//        the navigation), the determinations set the status and the steam,
//        Prepare and Activate save it, and the active voyage reads back with
//        $expand=to_Stops;
//     d. Approve as a bound action answers the voyage with status A;
//     e. a voyage whose ship is not in the fleet fails Prepare and Activate
//        with the validation's message and nothing is written;
//     f. V2 serves the same instances with the version in the key;
//  4. opens the Fiori Elements V4 app "Voyages" from the launchpad tile
//     (Playwright from the engine's node_modules; SAPUI5 comes from
//     ui5.sap.com, so the browser needs to reach it): the list shows the
//     seeded voyages, and Create -> route, ship, a port -> Save runs the
//     draft flow (Prepare + Activate) end to end.
//
// SLICE_SKIP_UI=1 skips item 4 and says so; nothing else is skippable.
// SLICE_CHROMIUM=<path> launches that Chromium instead of the one the
// engine's Playwright expects.
import {spawn, spawnSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {createServer} from "node:net";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {describeEngine, engineEnv, transpile} from "./engine.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.OSD_HOME;
if (home === undefined || home === "") {
  console.error("rap: set OSD_HOME to an open-steamgate checkout");
  process.exit(2);
}
const seed = (table) => JSON.parse(readFileSync(join(repo, "data", `${table}.tabu.json`), "utf8"));
const voyages = seed("zosd_fleet_voyage");
const stops = seed("zosd_fleet_stop");

const freePort = () => new Promise((ok, fail) => {
  const probe = createServer().listen(0, "127.0.0.1", () => {
    const {port} = probe.address();
    probe.close(() => ok(port));
  }).on("error", fail);
});
const port = Number(process.env.STG_PORT || await freePort());
const base = `http://localhost:${port}`;
const v4 = `${base}/sap/opu/odata4/sap/ZUI_OSD_FLEET_VOY`;
const v2 = `${base}/sap/opu/odata/sap/ZUI_OSD_FLEET_VOY`;
const env = engineEnv(home, repo, {STG_PORT: String(port)});
const write = {"content-type": "application/json", "x-csrf-token": "open-steamgate", accept: "application/json"};

const results = [];
let server;
let dbDir;

// the engine is stopped and the throwaway database removed on every way
// out: the end of the run, an early exit, a thrown error or a signal
function stop() {
  if (server?.pid !== undefined && server.exitCode === null) {
    try {
      process.kill(server.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  if (dbDir !== undefined) {
    rmSync(dbDir, {recursive: true, force: true});
    dbDir = undefined;
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

async function call(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return {status: res.status, body, headers: res.headers};
}

const key = (id, active) => `(voyage_uuid='${id}',IsActiveEntity=${active})`;
const act = (id, active, action, body = "{}") => call(`${v4}/Voyage${key(id, active)}/ZUI_OSD_FLEET_VOY.${action}`,
  {method: "POST", headers: {...write, "if-match": "*"}, body});

// 1. build: the pack is compiled into a fresh generation
describeEngine("rap", home, repo);
transpile("rap", home, env);

// 2. ABAP Unit of the EML class: the chapter's statements against the runtime
await check("1 ABAP Unit of ZCL_OSD_FLEET_VOYAGE_EML", async () => {
  const unit = spawnSync(process.execPath, ["tools/osd-unit.mjs", "CLAS", "ZCL_OSD_FLEET_VOYAGE_EML"],
    {cwd: home, env, encoding: "utf8"});
  const out = unit.stdout + unit.stderr;
  expect(unit.status === 0, `exit ${unit.status}: ${out.split("\n").filter((l) => !/^(not activated|cross-reference)/.test(l)).slice(-6).join(" | ")}`);
  const summary = /ZCL_OSD_FLEET_VOYAGE_EML: (.*)/.exec(out)?.[1];
  expect(summary !== undefined, `no summary line in: ${out.slice(-400)}`);
  expect(/3 methods in 1 test classes, 3 passed, 0 failed/.test(summary), summary);
  return summary;
});

// 3. the engine, on a database of its own
dbDir = mkdtempSync(join(tmpdir(), "osg-rap-"));
const dbFile = join(dbDir, (process.env.STG_DB ?? "sqlite") === "duckdb" ? "osd.duckdb" : "osd.sqlite");
server = spawn(process.execPath, ["test/run.mjs"],
  {cwd: home, env: {...env, STG_DB_PATH: dbFile}, stdio: ["ignore", "ignore", "inherit"]});
console.log(`rap: engine PID ${server.pid} on port ${port}`);
const deadline = Date.now() + 180_000;
for (;;) {
  expect(server.exitCode === null, `the engine exited with ${server.exitCode}`);
  const ready = await fetch(`${v4}/$metadata`).then((r) => r.ok, () => false);
  if (ready) break;
  if (Date.now() > deadline) {
    console.error("rap: the engine did not serve ZUI_OSD_FLEET_VOY within 180 s");
    process.exit(1);
  }
  await new Promise((ok) => setTimeout(ok, 1000));
}

// 4. the checks
await check("2 $metadata: Voyage and Stop, the draft key and actions, DraftRoot", async () => {
  const {status, body} = await call(`${v4}/$metadata`);
  expect(status === 200, `HTTP ${status}`);
  for (const text of [
    `<EntityType Name="VoyageType"><Key><PropertyRef Name="voyage_uuid"/><PropertyRef Name="IsActiveEntity"/></Key>`,
    `<Property Name="steam_needed" Type="Edm.Int32"/>`,
    `<EntityType Name="StopType"><Key><PropertyRef Name="stop_uuid"/><PropertyRef Name="IsActiveEntity"/></Key>`,
    `<Action Name="Edit" IsBound="true" EntitySetPath="_it"><Parameter Name="_it" Type="ZUI_OSD_FLEET_VOY.VoyageType" Nullable="false"/><Parameter Name="PreserveChanges" Type="Edm.Boolean"/>`,
    `<Action Name="Activate" IsBound="true"`,
    `<Action Name="Prepare" IsBound="true"`,
    `<Action Name="Approve" IsBound="true"`,
    `<Action Name="Cancel" IsBound="true"`,
    `<NavigationProperty Name="SiblingEntity" Type="ZUI_OSD_FLEET_VOY.VoyageType"/>`,
    `<EntityType Name="DraftAdministrativeDataType">`,
  ]) expect(body.includes(text), `missing: ${text.slice(0, 60)}`);
  expect(/Target="ZUI_OSD_FLEET_VOY.Container\/Voyage">\s*<Annotation Term="com.sap.vocabularies.Common.v1.DraftRoot">/.test(body), "no DraftRoot on the Voyage set");
  expect(/Target="ZUI_OSD_FLEET_VOY.Container\/Stop">\s*<Annotation Term="com.sap.vocabularies.Common.v1.DraftNode">/.test(body), "no DraftNode on the Stop set");
  return "Voyage, Stop, the draft actions, Approve, Cancel, DraftRoot, DraftNode";
});

await check("3 the seeded voyages with their stops, and their steam", async () => {
  const res = await call(`${v4}/Voyage?$count=true`);
  expect(res.status === 200, JSON.stringify(res.body));
  expect(res.body["@odata.count"] === voyages.length, `${res.body["@odata.count"]} voyages, the seed has ${voyages.length}`);
  for (const v of voyages) {
    const one = await call(`${v4}/Voyage${key(v.voyage_uuid, true)}?$expand=to_Stops`);
    expect(one.status === 200, `${v.voyage_uuid}: HTTP ${one.status}`);
    const mine = stops.filter((s) => s.voyage_uuid === v.voyage_uuid);
    expect(one.body.steam_needed === 15 + 10 * mine.length,
      `${v.route}: steam ${one.body.steam_needed}, the rule says ${15 + 10 * mine.length}`);
    expect(one.body.to_Stops.map((s) => s.port_name).join() === mine.map((s) => s.port_name).join(),
      `${v.route}: stops ${one.body.to_Stops.map((s) => s.port_name)}`);
  }
  return `${voyages.length} voyages, ${stops.length} stops, steam as the rule computes it`;
});

const made = [];
await check("4 a draft, a stop below it, Prepare, Activate", async () => {
  const created = await call(`${v4}/Voyage`, {method: "POST", headers: write, body: JSON.stringify({ship_id: "S006", route: "Fjords of the book"})});
  expect(created.status === 201, JSON.stringify(created.body));
  expect(created.body.IsActiveEntity === false, "a POST to a draft root's set makes a draft");
  const id = created.body.voyage_uuid;
  made.push(id);
  expect(created.body.status === "P", `status ${created.body.status}: SetPlanned did not run`);
  expect(created.body.steam_needed === 15, `steam ${created.body.steam_needed} with no port yet`);
  const stop = await call(`${v4}/Voyage${key(id, false)}/to_Stops`, {method: "POST", headers: write, body: JSON.stringify({port_name: "Bergen", stop_order: 1})});
  expect(stop.status === 201, JSON.stringify(stop.body));
  expect(stop.body.IsActiveEntity === false, "a child of a draft is a draft");
  const draft = await call(`${v4}/Voyage${key(id, false)}`);
  expect(draft.body.steam_needed === 25, `steam ${draft.body.steam_needed} after one port: the stop's determination ran`);
  expect((await call(`${v4}/Voyage${key(id, true)}`)).status === 404, "no active instance yet");
  expect((await act(id, false, "Prepare")).status === 200, "Prepare ran");
  const active = await act(id, false, "Activate");
  expect(active.status === 200, JSON.stringify(active.body));
  expect(active.body.IsActiveEntity === true, "Activate answers the active voyage");
  expect(active.body.steam_needed === 25, "the steam went with it");
  expect((await call(`${v4}/Voyage${key(id, false)}`)).status === 404, "the draft is gone");
  const read = await call(`${v4}/Voyage${key(id, true)}?$expand=to_Stops`);
  expect(read.body.to_Stops.map((s) => [s.port_name, s.stop_order]).join() === "Bergen,1", JSON.stringify(read.body.to_Stops));
  return "status P, steam 15 -> 25, Prepare and Activate, the stop expanded";
});

await check("5 Approve as a bound action sets A", async () => {
  const id = made[0];
  const res = await act(id, true, "Approve");
  expect(res.status === 200, JSON.stringify(res.body));
  expect(res.body.status === "A", `status ${res.body.status}`);
  expect(res.body.steam_needed === 25, "the action answers the whole voyage ($self)");
  const after = await call(`${v4}/Voyage${key(id, true)}`);
  expect(after.body.status === "A", `the saved status is ${after.body.status}`);
  return "Approve -> A, read back A";
});

await check("6 an unknown ship: Prepare and Activate refuse, nothing is written", async () => {
  const created = await call(`${v4}/Voyage`, {method: "POST", headers: write, body: JSON.stringify({ship_id: "S999", route: "Nowhere at all"})});
  expect(created.status === 201, JSON.stringify(created.body));
  const id = created.body.voyage_uuid;
  for (const action of ["Prepare", "Activate"]) {
    const res = await act(id, false, action);
    expect(res.status === 400, `${action}: HTTP ${res.status} ${JSON.stringify(res.body)}`);
    expect(res.body?.error?.message === "Ship S999 is not in the fleet", `${action}: ${res.body?.error?.message}`);
  }
  expect((await call(`${v4}/Voyage${key(id, true)}`)).status === 404, "nothing was written");
  expect((await call(`${v4}/Voyage${key(id, false)}`)).status === 200, "the draft stays");
  const rows = await call(`${v4}/Voyage?$filter=${encodeURIComponent("route eq 'Nowhere at all'")}&$count=true`);
  expect(rows.body["@odata.count"] === 1, "the draft is the only row");
  // leave nothing held: discard the draft
  expect((await call(`${v4}/Voyage${key(id, false)}`, {method: "DELETE", headers: {...write, "if-match": "*"}})).status === 204);
  expect((await call(`${v4}/Voyage?$filter=${encodeURIComponent("route eq 'Nowhere at all'")}&$count=true`)).body["@odata.count"] === 0);
  return "400 with the validation's message, no active row, the draft discarded";
});

await check("7 V2 serves the same instances, the version in the key", async () => {
  const res = await call(`${v2}/Voyage?$filter=${encodeURIComponent(`voyage_uuid eq '${made[0]}'`)}&$format=json`);
  expect(res.status === 200, JSON.stringify(res.body));
  expect(res.body.d.results.length === 1, `${res.body.d.results.length} rows`);
  expect(res.body.d.results[0].status === "A", "the approved voyage over V2");
  expect(/Voyage\(voyage_uuid='[0-9A-F]{32}',IsActiveEntity=true\)$/.test(res.body.d.results[0].__metadata.uri),
    `the key carries the version: ${res.body.d.results[0].__metadata.uri}`);
  return "V2 list read with IsActiveEntity in the key";
});

// leave what check 4 and 5 made: the pack's own rows, gone again
await check("8 the pack's rows are gone again", async () => {
  for (const id of made) {
    const res = await call(`${v4}/Voyage${key(id, true)}`, {method: "DELETE", headers: {...write, "if-match": "*"}});
    expect(res.status === 204, `DELETE ${id}: HTTP ${res.status}`);
  }
  const count = await call(`${v4}/Voyage?$count=true`);
  expect(count.body["@odata.count"] === voyages.length, `${count.body["@odata.count"]} voyages left, the seed has ${voyages.length}`);
  return `${voyages.length} voyages, as seeded`;
});

if (process.env.SLICE_SKIP_UI === "1") {
  results.push({name: "9 the Voyages tile -> list report, create, a port, save", ok: true, skipped: true});
  console.log("SKIP  9 the Voyages tile -> list report, create, a port, save -- SLICE_SKIP_UI=1");
} else {
  await check("9 the Voyages tile -> list report, create, a port, save", async () => {
    const {chromium} = createRequire(join(home, "package.json"))("playwright");
    const browser = await chromium.launch(process.env.SLICE_CHROMIUM ? {executablePath: process.env.SLICE_CHROMIUM} : {});
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      // Console errors from SAPUI5 itself are common and not ours; they are
      // printed for the record. What fails the check is ours: an HTTP error
      // on this pack's app or its service, or a console error that names them.
      const ours = /zosd_voyage4|ZUI_OSD_FLEET_VOY/i;
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
      const tile = page.locator(".sapUshellTile", {has: page.locator('a[href$="#Voyage-manage"]')});
      await tile.waitFor({timeout: 90_000});
      await Promise.all([
        page.waitForURL(/#Voyage-manage/, {timeout: 90_000}),
        tile.click(),
      ]);
      await page.getByRole("button", {name: "Create"}).waitFor({timeout: 90_000});
      for (const v of voyages) {
        await page.getByText(v.route, {exact: true}).first().waitFor({timeout: 90_000});
      }
      // Create: a draft; route and ship; a port below it; Save = Prepare + Activate
      await page.getByRole("button", {name: "Create"}).click();
      await page.waitForURL(/voyage_uuid='[0-9A-F]{32}',IsActiveEntity=false/, {timeout: 60_000});
      const id = /voyage_uuid='([0-9A-F]{32})'/.exec(page.url())[1];
      // what the draft holds on the server: a field change is PATCHed when
      // the field is left, so poll the service rather than trust a toast
      const draft = async () => (await call(`${v4}/Voyage${key(id, false)}`)).body;
      const until = async (what, label, timeout = 60_000) => {
        const end = Date.now() + timeout;
        for (;;) {
          const body = await draft();
          if (what(body)) return body;
          if (Date.now() > end) throw new Error(`${label}: the draft never held it: ${JSON.stringify(body).slice(0, 300)}`);
          await new Promise((ok) => setTimeout(ok, 500));
        }
      };
      const route = page.getByLabel("Route").locator("visible=true").first();
      const text = `Rap UI ${Date.now()}`;
      await route.fill(text);
      await route.press("Tab");
      const ship = page.getByLabel("Ship").locator("visible=true").first();
      await ship.fill("S001");
      await ship.press("Tab");
      await until((body) => body.route === text && body.ship_id === "S001", "the route and the ship");
      await page.getByRole("button", {name: "Create"}).locator("visible=true").first().click();
      const port = page.locator("table input").locator("visible=true").last();
      await port.waitFor({timeout: 30_000});
      // sap.fe renders the row's field before the draft's stop exists, and a
      // value typed then is lost (the trip4 spec meets the same thing): type
      // until it stays, judged by what the service holds
      const portLanded = async () => (await call(`${v4}/Voyage${key(id, false)}/to_Stops`)).body.value
        .some((s) => s.port_name === "Bergen");
      const portEnd = Date.now() + 60_000;
      for (;;) {
        await port.fill("Bergen");
        await port.press("Tab");
        for (let i = 0; i < 8 && !(await portLanded()); i++) await new Promise((ok) => setTimeout(ok, 500));
        if (await portLanded()) break;
        if (Date.now() > portEnd) throw new Error("the port never reached the draft");
      }
      await until((body) => body.steam_needed === 25, "the stop's determination: the steam of one port");
      const save = page.getByRole("button", {name: /^(Create|Save)$/}).locator("visible=true").last();
      await save.click();
      await page.getByRole("button", {name: "Edit"}).waitFor({timeout: 60_000});
      // the active voyage, by its semantic key (Common.SemanticKey:
      // voyage_uuid): in the launchpad the app's route follows the intent,
      // #Voyage-manage&/Voyage('<uuid>')
      await page.waitForURL(new RegExp(`/Voyage\\((voyage_uuid=)?'${id}'`), {timeout: 60_000});
      const saved = await call(`${v4}/Voyage${key(id, true)}`);
      expect(saved.body.status === "P" && saved.body.steam_needed === 25,
        `the saved voyage: status ${saved.body.status}, steam ${saved.body.steam_needed}`);
      const stopsOfIt = await call(`${v4}/Voyage${key(id, true)}/to_Stops`);
      expect(stopsOfIt.body.value.map((s) => s.port_name).join() === "Bergen", JSON.stringify(stopsOfIt.body.value));
      await page.waitForLoadState("networkidle").catch(() => {});
      for (const e of errors) console.log(`      console error: ${e.replace(/\s+/g, " ").slice(0, 200)}`);
      // No 412 is tolerated: the stop's determination changes the voyage
      // (its steam, and so its ETag), but the Common.SideEffects annotation
      // makes sap.fe read the voyage again after a stop changes, and the
      // fresh ETag comes with it, so the save sends the current one. Without
      // that annotation sap.fe logged one recoverable 412 here; with it,
      // three runs in a row logged none, so a 412 now means the side effect
      // was lost. Only the app's missing flexibility bundles are expected.
      const named = errors.filter((e) => ours.test(e)
        && !/resource osd\/voyage\/changes\/(?:changes|flexibility)-bundle\.json could not be loaded/.test(e));
      expect(failures.length === 0, `HTTP errors on this pack: ${failures.join("; ")}`);
      expect(named.length === 0, `console errors naming this pack: ${named.join(" | ").slice(0, 400)}`);
      // leave nothing behind
      expect((await call(`${v4}/Voyage${key(id, true)}`, {method: "DELETE", headers: {...write, "if-match": "*"}})).status === 204);
      return `the tile opens the app; the seeded voyages in the list; created, saved and deleted ${id}`;
    } finally {
      await browser.close();
    }
  });
}

stop();
const failed = results.filter((r) => !r.ok);
const skipped = results.filter((r) => r.skipped);
console.log(`rap: ${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
process.exit(failed.length === 0 ? 0 : 1);
