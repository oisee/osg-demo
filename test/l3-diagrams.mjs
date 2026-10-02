// Diagrams of the night set for book chapter 16, English and Russian, into
// book/img/l3-*.png and book/img/l3-*.ru.png:
//
//   OSD_HOME=<open-steamgate checkout> node test/l3-diagrams.mjs
//
// Drawn here as SVG from what test/l3.mjs checks (the stages, the piles and
// their jobs, the worklist, the gate) and from docs/dsl-l3.md of
// open-steamgate (the race at the gate, a failed pile), then photographed
// with open-steamgate's Playwright Chromium. Nothing is read from a run: job
// names and keys are those of the fleet's seed for 2026-10-01.
import {mkdirSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.OSD_HOME ? resolve(process.env.OSD_HOME) : "";
if (!home) {
  console.error("l3-diagrams: set OSD_HOME to an open-steamgate checkout");
  process.exit(2);
}
const out = join(repo, "book", "img");
mkdirSync(out, {recursive: true});

const C = {
  ink: "#1f2933", soft: "#52606d", line: "#9aa5b1", paper: "#ffffff",
  s1: "#e3effd", s1e: "#2f6fb5", s2: "#e0f4ef", s2e: "#1f8a70",
  work: "#fff4d6", worke: "#c08a00", gate: "#f3e8ff", gatee: "#7b4bb7",
  alert: "#fde4e4", alerte: "#c0392b", job: "#f1f3f5", jobe: "#7b8794",
  fail: "#fbd5d5", ghost: "#f7f7f7",
};
const SANS = "DejaVu Sans, Liberation Sans, Arial, sans-serif";
const MONO = "DejaVu Sans Mono, Liberation Mono, monospace";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// a line of text; mono for identifiers
function text(x, y, s, {size = 14, weight = 400, fill = C.ink, mono = false, anchor = "middle", italic = false} = {}) {
  return `<text x="${x}" y="${y}" font-family="${mono ? MONO : SANS}" font-size="${size}" font-weight="${weight}"`
    + ` fill="${fill}" text-anchor="${anchor}"${italic ? ' font-style="italic"' : ""}>${esc(s)}</text>`;
}
// a box with centred lines: [text, opts] or text
function box(x, y, w, h, fill, stroke, lines = [], {r = 10, dash = false, lh = 18, size = 14} = {}) {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"${dash ? ' stroke-dasharray="5 4"' : ""}/>`;
  const top = y + h / 2 - ((lines.length - 1) * lh) / 2 + size * 0.35;
  lines.forEach((l, i) => {
    const [t, o] = Array.isArray(l) ? l : [l, {}];
    s += text(x + w / 2, top + i * lh, t, {size, ...o});
  });
  return s;
}
// a table as a cylinder
function table(x, y, w, h, fill, stroke, lines, {lh = 18} = {}) {
  const e = 9;
  let s = `<path d="M${x},${y + e} v${h - 2 * e} a${w / 2},${e} 0 0 0 ${w},0 v${-(h - 2 * e)}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
  s += `<ellipse cx="${x + w / 2}" cy="${y + e}" rx="${w / 2}" ry="${e}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
  const top = y + e + (h - e) / 2 - ((lines.length - 1) * lh) / 2 + 5;
  lines.forEach((l, i) => {
    const [t, o] = Array.isArray(l) ? l : [l, {}];
    s += text(x + w / 2, top + i * lh, t, {size: 14, ...o});
  });
  return s;
}
function arrow(x1, y1, x2, y2, {label, color = C.soft, dy = -8, dx = 0, dash = false, size = 13, anchor = "middle"} = {}) {
  let s = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.8" marker-end="url(#a-${color.slice(1)})"${dash ? ' stroke-dasharray="5 4"' : ""}/>`;
  if (label) s += text((x1 + x2) / 2 + dx, (y1 + y2) / 2 + dy, label, {size, fill: color, anchor});
  return s;
}
function svg(w, h, body) {
  const colors = [...new Set([C.soft, C.s1e, C.s2e, C.worke, C.gatee, C.alerte, C.jobe, C.ink])];
  const markers = colors.map((c) => `<marker id="a-${c.slice(1)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${markers}</defs><rect width="${w}" height="${h}" fill="${C.paper}"/>${body}</svg>`;
}
const chip = (x, y, id, {fill = C.paper, stroke = C.jobe, faded = false} = {}) =>
  box(x, y, 64, 28, faded ? C.ghost : fill, faded ? "#cbd2d9" : stroke, [[id, {mono: true, size: 13, fill: faded ? "#9aa5b1" : C.ink}]], {r: 6, dash: faded});

// 1. the set: what runs, in which order, over which tables
function shape(t) {
  let b = "";
  b += box(20, 118, 140, 94, C.job, C.jobe, [["L3_NIGHT_D", {mono: true, weight: 700}], [t("every day 02:00", "ежедневно 02:00"), {size: 13}], [t("schedule( )", "schedule( )"), {mono: true, size: 12, fill: C.soft}]]);
  b += box(195, 60, 240, 210, C.s1, C.s1e, [], {r: 14});
  b += text(315, 86, t("Stage 1 · candidates", "Этап 1 · candidates"), {weight: 700, fill: C.s1e});
  b += text(315, 106, t("a filter: fills a worklist", "фильтр: заполняет рабочий список"), {size: 12, fill: C.soft});
  b += box(212, 122, 206, 56, C.paper, C.s1e, [["busy-ship", {mono: true, weight: 700}], [t("a voyage departs later", "впереди есть рейс"), {size: 12, fill: C.soft}]]);
  b += text(315, 210, t("3 piles of 2 ships", "3 стопки по 2 корабля"), {size: 13});
  b += text(315, 230, t("→ 3 jobs", "→ 3 задания"), {size: 13});
  b += `<polygon points="520,120 572,165 520,210 468,165" fill="${C.gate}" stroke="${C.gatee}" stroke-width="1.6"/>`;
  b += text(520, 162, t("gate", "шлюз"), {weight: 700, fill: C.gatee});
  b += text(520, 180, "STAGE", {size: 11, mono: true, fill: C.gatee});
  b += box(605, 60, 250, 210, C.s2, C.s2e, [], {r: 14});
  b += text(730, 86, t("Stage 2 · checks", "Этап 2 · checks"), {weight: 700, fill: C.s2e});
  b += text(730, 106, t("over the worklist only", "только по рабочему списку"), {size: 12, fill: C.soft});
  b += box(620, 118, 220, 40, C.paper, C.s2e, [["low-steam-voyage", {mono: true, weight: 700, size: 13}]]);
  b += box(620, 166, 220, 40, C.paper, C.s2e, [["maintenance-voyage", {mono: true, weight: 700, size: 13}]]);
  b += text(730, 238, t("2 piles × 2 rules → 4 jobs", "2 стопки × 2 правила → 4 задания"), {size: 13});
  b += table(885, 115, 140, 100, C.alert, C.alerte, [[t("alerts", "alerts"), {weight: 700}], ["ZOSD_L3_ALERT", {mono: true, size: 11}], [t("2 lines, S004", "2 строки, S004"), {size: 12}]]);
  b += table(215, 330, 160, 86, C.paper, C.jobe, [[t("port ships", "порт ships"), {weight: 700}], ["ZOSD_FLEET_SHIP", {mono: true, size: 11}], [t("6 ships", "6 кораблей"), {size: 12}]]);
  b += table(430, 330, 260, 86, C.work, C.worke, [[t("worklist busy", "рабочий список busy"), {weight: 700}], ["ZOSD_L3_WORK", {mono: true, size: 11}], ["S001 S003 S004 S005", {mono: true, size: 12}]]);
  b += arrow(160, 165, 193, 165);
  b += arrow(435, 165, 466, 165, {color: C.gatee});
  b += text(520, 234, t("opens once, when every", "открывается один раз,"), {size: 12, fill: C.gatee});
  b += text(520, 250, t("pile of stage 1 is DONE", "когда этап 1 DONE"), {size: 12, fill: C.gatee});
  b += arrow(572, 165, 603, 165, {color: C.gatee});
  b += arrow(855, 165, 883, 165, {color: C.alerte});
  b += arrow(295, 328, 295, 272, {label: t("keys by pile", "ключи по стопкам"), dx: 8, dy: 4, anchor: "start", size: 12});
  b += arrow(380, 272, 470, 328, {label: t("keys( )", "keys( )"), color: C.worke, dx: 12, dy: 0, anchor: "start", size: 12});
  b += arrow(650, 328, 700, 272, {label: t("read", "чтение"), color: C.worke, dx: 10, dy: 8, anchor: "start", size: 12});
  return svg(1045, 435, b);
}

// 2. the piles and their jobs
function piles(t) {
  let b = "";
  b += text(20, 30, t("Stage 1 · over the port ships, piles of 2", "Этап 1 · по порту ships, стопки по 2"), {anchor: "start", weight: 700, fill: C.s1e});
  const g1 = [["S001", "S002"], ["S003", "S004"], ["S005", "S006"]];
  g1.forEach((p, i) => {
    const x = 20 + i * 200;
    b += box(x - 8, 44, 160, 44, C.s1, C.s1e, [], {r: 8});
    b += chip(x, 52, p[0]);
    b += chip(x + 80, 52, p[1]);
    b += arrow(x + 72, 90, x + 72, 108, {color: C.s1e});
    b += box(x - 8, 110, 160, 30, C.job, C.jobe, [[`L3_NIGHT_101_000${i + 1}`, {mono: true, size: 12}]], {r: 6});
  });
  b += text(640, 66, t("job name:", "имя задания:"), {anchor: "start", size: 13, fill: C.soft});
  b += text(640, 88, "L3_NIGHT_<s><nn>_<pppp>", {anchor: "start", mono: true, size: 14});
  b += text(640, 110, t("s stage, nn rule, pppp pile", "s этап, nn правило, pppp стопка"), {anchor: "start", size: 13, fill: C.soft});
  b += text(640, 132, t("busy-ship is rule 01 of stage 1", "busy-ship — правило 01 этапа 1"), {anchor: "start", size: 13, fill: C.soft});

  b += arrow(300, 144, 300, 176, {color: C.worke});
  b += box(20, 180, 600, 50, C.work, C.worke, [], {r: 10});
  b += text(36, 210, t("worklist busy", "список busy"), {anchor: "start", weight: 700, fill: C.worke});
  ["S001", "S002", "S003", "S004", "S005", "S006"].forEach((id, i) => {
    b += chip(170 + i * 74, 191, id, {faded: id === "S002" || id === "S006", stroke: C.worke});
  });
  b += text(640, 202, t("S002 and S006 have no voyage", "у S002 и S006 нет рейса"), {anchor: "start", size: 13, fill: C.soft});
  b += text(640, 222, t("after 2026-10-01: not selected", "после 2026-10-01: не отобраны"), {anchor: "start", size: 13, fill: C.soft});

  b += text(20, 270, t("Stage 2 · over the worklist, piles of 2", "Этап 2 · по рабочему списку, стопки по 2"), {anchor: "start", weight: 700, fill: C.s2e});
  // pile 1: S001 ... S003, S002 inside the bounds but not on the worklist
  b += box(12, 284, 250, 44, C.s2, C.s2e, [], {r: 8});
  b += chip(20, 292, "S001");
  b += chip(94, 292, "S002", {faded: true});
  b += chip(168, 292, "S003");
  b += box(312, 284, 176, 44, C.s2, C.s2e, [], {r: 8});
  b += chip(320, 292, "S004", {stroke: C.alerte, fill: C.alert});
  b += chip(400, 292, "S005");
  b += text(137, 346, t("pile 1: S001–S003, I EQ each", "стопка 1: S001–S003, каждый I EQ"), {size: 12, fill: C.soft});
  b += text(400, 346, t("pile 2: S004–S005", "стопка 2: S004–S005"), {size: 12, fill: C.soft});
  const jobs = [[12, "L3_NIGHT_202_0001", "L3_NIGHT_203_0001"], [312, "L3_NIGHT_202_0002", "L3_NIGHT_203_0002"]];
  for (const [x, a, c] of jobs) {
    b += box(x, 358, 176, 28, C.job, C.jobe, [[a, {mono: true, size: 12}]], {r: 6});
    b += box(x, 392, 176, 28, C.job, C.jobe, [[c, {mono: true, size: 12}]], {r: 6});
  }
  b += text(196, 377, "low-steam", {anchor: "start", size: 11, fill: C.soft, mono: true});
  b += text(196, 411, "maint", {anchor: "start", size: 11, fill: C.soft, mono: true});
  b += box(560, 352, 470, 74, C.alert, C.alerte, [
    ["S004 Cumulus: 15 % steam, voyage V00016 …", {mono: true, size: 12}],
    ["S004 Cumulus: in maintenance, voyage V00016 …", {mono: true, size: 12}],
    [t("ZOSD_L3_ALERT, one line per rule", "ZOSD_L3_ALERT, по строке на правило"), {size: 12, fill: C.alerte}]], {lh: 20});
  b += arrow(490, 389, 557, 389, {color: C.alerte});
  b += text(640, 300, t("A pile over a worklist checks its keys,", "Стопка по списку проверяет его ключи,"), {anchor: "start", size: 13, fill: C.soft});
  b += text(640, 320, t("not every key between its bounds", "а не всё между её границами"), {anchor: "start", size: 13, fill: C.soft});
  return svg(1045, 440, b);
}

// 3. a run in jobs, in time
function timeline(t) {
  let b = "";
  const lane = (y, label, sub) => {
    b += `<line x1="200" y1="${y + 34}" x2="1025" y2="${y + 34}" stroke="#e4e7eb"/>`;
    b += text(20, y + 18, label, {anchor: "start", weight: 700, size: 13});
    if (sub) b += text(20, y + 34, sub, {anchor: "start", size: 11, fill: C.soft, mono: true});
  };
  lane(20, t("dialog step", "диалоговый шаг"), "ZCL_OSD_FLEET_NIGHT_JOBS");
  lane(80, t("worker", "обработчик"), "osd-batch-runs work");
  lane(170, t("gate, stage 1", "шлюз, этап 1"), "ZOSD_L3_STAGE");
  lane(220, t("gate, stage 2", "шлюз, этап 2"), "ZOSD_L3_STAGE");
  b += box(205, 26, 200, 30, C.job, C.jobe, [[t("run( 'P' ): plan 1, submit 3", "run( 'P' ): план 1, 3 задания"), {size: 12}]], {r: 6});
  const x0 = 420, w = 70, g = 6;
  const bar = (i, name, fill, stroke) => {
    const x = x0 + i * (w + g) + (i >= 3 ? 34 : 0);
    b += box(x, 88, w, 30, fill, stroke, [[name, {mono: true, size: 11}]], {r: 5});
    return x;
  };
  ["101_0002", "101_0001", "101_0003"].forEach((n, i) => bar(i, n, C.s1, C.s1e));
  const last1 = x0 + 2 * (w + g) + w;
  ["203_0001", "203_0002", "202_0002", "202_0001"].forEach((n, i) => bar(i + 3, n, C.s2, C.s2e));
  const last2 = x0 + 6 * (w + g) + 34 + w;
  b += text(x0 + 110, 140, t("stage 1, one job after another", "этап 1, задания по очереди"), {size: 12, fill: C.s1e});
  b += text(x0 + 3 * (w + g) + 34 + 150, 140, t("stage 2 after the gate", "этап 2 после шлюза"), {size: 12, fill: C.s2e});
  // gate states
  const st = (x1, x2, y, label, fill, stroke) => { b += box(x1, y, x2 - x1, 26, fill, stroke, [[label, {size: 11, mono: true}]], {r: 4}); };
  st(205, 290, 176, "WAITING", C.paper, C.line);
  st(290, last1, 176, "OPEN", C.s1, C.s1e);
  st(last1, 1020, 176, "DONE", C.paper, C.s1e);
  st(205, last1, 226, "WAITING", C.paper, C.line);
  st(last1, last2, 226, "OPEN", C.s2, C.s2e);
  st(last2, 1020, 226, "DONE", C.paper, C.s2e);
  b += `<line x1="${last1}" y1="66" x2="${last1}" y2="262" stroke="${C.gatee}" stroke-width="1.6" stroke-dasharray="4 3"/>`;
  b += `<line x1="${last2}" y1="66" x2="${last2}" y2="262" stroke="${C.ink}" stroke-width="1.6" stroke-dasharray="4 3"/>`;
  b += box(last1 - 190, 278, 300, 66, C.gate, C.gatee, [
    [t("the last pile of stage 1: advance( )", "последняя стопка этапа 1: advance( )"), {size: 12}],
    ["UPDATE … WHERE status = 'WAITING'", {mono: true, size: 11}],
    [t("1 row: plan stage 2, submit 4", "1 строка: план этапа 2, 4 задания"), {size: 12}]], {lh: 19});
  b += box(772, 278, 245, 66, C.paper, C.ink, [
    [t("the last pile of the run", "последняя стопка прогона"), {size: 12}],
    [t("finalise every rule,", "закрыть каждое правило,"), {size: 12}],
    [t("release the date's lock", "снять блокировку даты"), {size: 12}]], {lh: 19});
  b += text(20, 380, t("Here one worker on SQLite runs the jobs one after another; on a system the piles of a stage run", "Здесь один обработчик на SQLite выполняет задания по очереди; в системе стопки одного этапа"), {anchor: "start", size: 12, fill: C.soft});
  b += text(20, 398, t("side by side, in as many background work processes as are free. The order inside a stage is not fixed.", "идут рядом, в стольких фоновых процессах, сколько свободно. Порядок внутри этапа не задан."), {anchor: "start", size: 12, fill: C.soft});
  b += text(1020, 16, t("time →", "время →"), {anchor: "end", size: 12, fill: C.soft});
  return svg(1045, 412, b);
}

// 4. what the gate guarantees: a race, and a failed pile
function gate(t) {
  let b = "";
  b += box(10, 10, 500, 380, "#fbfbfd", "#d9dee4", [], {r: 12});
  b += text(260, 38, t("Two jobs end stage 1 at the same moment", "Два задания заканчивают этап 1 одновременно"), {weight: 700, size: 14});
  b += box(40, 60, 190, 32, C.s1, C.s1e, [["L3_NIGHT_101_0001", {mono: true, size: 12}]], {r: 6});
  b += box(290, 60, 190, 32, C.s1, C.s1e, [["L3_NIGHT_101_0003", {mono: true, size: 12}]], {r: 6});
  b += text(135, 120, t("COMMIT: my pile DONE", "COMMIT: моя стопка DONE"), {size: 12});
  b += text(385, 120, t("COMMIT: my pile DONE", "COMMIT: моя стопка DONE"), {size: 12});
  b += text(135, 142, t("every pile DONE? yes", "все стопки DONE? да"), {size: 12});
  b += text(385, 142, t("every pile DONE? yes", "все стопки DONE? да"), {size: 12});
  b += box(60, 162, 400, 52, C.gate, C.gatee, [["UPDATE zosd_l3_stage SET status = 'OPEN'", {mono: true, size: 11}], ["WHERE … stage_no = 2 AND status = 'WAITING'", {mono: true, size: 11}]], {lh: 18});
  b += arrow(135, 150, 180, 160, {color: C.gatee});
  b += arrow(385, 150, 340, 160, {color: C.gatee});
  b += box(40, 240, 190, 58, C.s2, C.s2e, [["sy-dbcnt = 1", {mono: true, size: 12, weight: 700}], [t("plans stage 2, submits", "план этапа 2, задания"), {size: 12}]], {r: 6});
  b += box(290, 240, 190, 58, C.ghost, C.line, [["sy-dbcnt = 0", {mono: true, size: 12, weight: 700}], [t("returns", "выходит"), {size: 12}]], {r: 6});
  b += arrow(180, 216, 140, 238, {color: C.s2e});
  b += arrow(340, 216, 380, 238, {color: C.soft});
  b += text(260, 330, t("One statement decides: stage 2 opens once,", "Решает одна команда: этап 2 открывается один раз,"), {size: 12, fill: C.soft});
  b += text(260, 348, t("whatever the timing. No named event, no lock", "как бы ни совпало время. Без событий и без"), {size: 12, fill: C.soft});
  b += text(260, 366, t("held while the jobs run.", "блокировки на время работы заданий."), {size: 12, fill: C.soft});

  b += box(530, 10, 505, 380, "#fbfbfd", "#d9dee4", [], {r: 12});
  b += text(782, 38, t("A pile fails (a set without resilience:)", "Стопка падает (набор без resilience:)"), {weight: 700, size: 14});
  b += box(555, 60, 140, 32, C.s1, C.s1e, [[t("pile 1 DONE", "стопка 1 DONE"), {size: 12}]], {r: 6});
  b += box(712, 60, 140, 32, C.fail, C.alerte, [[t("pile 2 FAILED", "стопка 2 FAILED"), {size: 12, weight: 700, fill: C.alerte}]], {r: 6});
  b += box(869, 60, 140, 32, C.s1, C.s1e, [[t("pile 3 DONE", "стопка 3 DONE"), {size: 12}]], {r: 6});
  b += text(782, 122, t("the gate is never tried: not every pile is DONE", "шлюз не пробуется: не все стопки DONE"), {size: 12});
  b += box(600, 140, 364, 40, C.paper, C.jobe, [["collect( )", {mono: true, size: 13, weight: 700}]], {r: 6});
  b += arrow(782, 128, 782, 138);
  b += box(570, 206, 200, 40, C.fail, C.alerte, [[t("stage 1 PARTIAL", "этап 1 PARTIAL"), {size: 12, weight: 700}]], {r: 6});
  b += box(795, 206, 200, 40, C.ghost, C.line, [[t("stage 2 NOT-RUN", "этап 2 NOT-RUN"), {size: 12, weight: 700}]], {r: 6});
  b += arrow(700, 182, 680, 204, {color: C.alerte});
  b += arrow(864, 182, 884, 204);
  b += text(782, 274, t("the gate closes, so no late job opens it;", "шлюз закрыт, опоздавшее задание его не откроет;"), {size: 12, fill: C.soft});
  b += text(782, 292, t("the run is final, the lock released", "прогон окончен, блокировка снята"), {size: 12, fill: C.soft});
  b += box(560, 312, 445, 62, C.s2, C.s2e, [
    [t("with resilience: a FAILED pile goes again (retry),", "с resilience: стопка FAILED идёт снова (retry),"), {size: 12}],
    [t("and a doctor job takes over what a dead job left", "а задание-доктор подбирает брошенное"), {size: 12}]], {lh: 20});
  return svg(1045, 400, b);
}

const pictures = {shape, piles, timeline, gate};
const {chromium} = createRequire(join(home, "package.json"))("playwright");
const browser = await chromium.launch(process.env.SLICE_CHROMIUM ? {executablePath: process.env.SLICE_CHROMIUM} : {});
try {
  const tab = await browser.newPage({deviceScaleFactor: 2});
  for (const [name, draw] of Object.entries(pictures)) {
    for (const [lang, suffix] of [["en", ""], ["ru", ".ru"]]) {
      const t = (en, ru) => (lang === "en" ? en : ru);
      await tab.setContent(`<!doctype html><html><body style="margin:0">${draw(t)}</body></html>`);
      const file = join(out, `l3-${name}${suffix}.png`);
      await tab.locator("svg").screenshot({path: file});
      console.log(`l3-diagrams: ${file}`);
    }
  }
} finally {
  await browser.close();
}
