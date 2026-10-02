// The picture of book chapter 18, English and Russian, into
// book/img/iti-pipeline.png and book/img/iti-pipeline.ru.png:
//
//   OSD_HOME=<open-steamgate checkout> node test/iti-diagram.mjs
//
// The way iti/mandel.c takes into ABAP and back out as a drawing, with the
// drawing itself read from iti/mandel.expected.txt, which test/iti.mjs
// checks the classrun against; photographed with open-steamgate's
// Playwright Chromium, like test/l3-diagrams.mjs.
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.OSD_HOME ? resolve(process.env.OSD_HOME) : "";
if (!home) {
  console.error("iti-diagram: set OSD_HOME to an open-steamgate checkout");
  process.exit(2);
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const drawing = readFileSync(join(repo, "iti", "mandel.expected.txt"), "utf8").trimEnd();
const cLines = readFileSync(join(repo, "iti", "mandel.c"), "utf8").trimEnd().split("\n").length;
const wasmBytes = readFileSync(join(repo, "iti", "mandel.wasm")).length;
const abapLines = readFileSync(join(repo, "src", "iti", "zcl_wasm_mandel.clas.abap"), "utf8").trimEnd().split("\n").length;

const page = (t) => `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; background: #fff; font-family: "DejaVu Sans", Arial, sans-serif; color: #1f2933; }
  .wrap { width: 1040px; padding: 20px; display: flex; gap: 22px; align-items: flex-start; }
  .steps { width: 330px; display: flex; flex-direction: column; gap: 10px; }
  .step { border: 1.6px solid; border-radius: 10px; padding: 10px 14px; }
  .step b { display: block; font-size: 15px; margin-bottom: 3px; }
  .step span { font-size: 12.5px; color: #52606d; }
  .arrow { text-align: center; color: #7b8794; font-size: 13px; line-height: 1; }
  .c { background: #f1f3f5; border-color: #7b8794; }
  .w { background: #f3e8ff; border-color: #7b4bb7; }
  .a { background: #e3effd; border-color: #2f6fb5; }
  .o { background: #e0f4ef; border-color: #1f8a70; }
  code { font-family: "DejaVu Sans Mono", monospace; font-size: 12px; }
  .term { flex: 1; background: #1f2933; color: #e4e7eb; border-radius: 10px; padding: 12px 14px; }
  .term .bar { color: #9aa5b1; font-size: 12px; margin-bottom: 8px; font-family: "DejaVu Sans Mono", monospace; }
  .term pre { margin: 0; font-family: "DejaVu Sans Mono", monospace; font-size: 10.5px; line-height: 1.18; }
</style></head><body><div class="wrap" id="pic">
  <div class="steps">
    <div class="step c"><b>${t("C", "C")}</b><span><code>iti/mandel.c</code>: ${cLines} ${t("lines, one function, 16.16 fixed point", "строк, одна функция, фиксированная точка 16.16")}</span></div>
    <div class="arrow">↓ <code>clang --target=wasm32</code></div>
    <div class="step w"><b>WebAssembly</b><span><code>mandel.wasm</code>: ${wasmBytes} ${t("bytes, 67 instructions", "байт, 67 инструкций")}</span></div>
    <div class="arrow">↓ <code>abapiti compile wasm</code></div>
    <div class="step a"><b>ABAP</b><span><code>ZCL_WASM_MANDEL</code>: ${abapLines} ${t("lines; memory is an xstring, every i32 add wraps", "строк; память — xstring, каждое сложение i32 заворачивается")}</span></div>
    <div class="arrow">↓ <code>F9</code> ${t("on", "на")} <code>ZCL_OSD_FLEET_ITI</code></div>
    <div class="step o"><b>${t("open-steamgate draws it", "open-steamgate рисует")}</b><span>${t("64 × 24 points, the same characters as the native C, byte for byte", "64 × 24 точки, те же символы, что у нативного C, байт в байт")}</span></div>
  </div>
  <div class="term"><div class="bar">--- classrun ZCL_OSD_FLEET_ITI ---</div><pre>${esc(drawing)}</pre></div>
</div></body></html>`;

const {chromium} = createRequire(join(home, "package.json"))("playwright");
const browser = await chromium.launch(process.env.SLICE_CHROMIUM ? {executablePath: process.env.SLICE_CHROMIUM} : {});
try {
  const tab = await browser.newPage({deviceScaleFactor: 2});
  for (const [lang, suffix] of [["en", ""], ["ru", ".ru"]]) {
    const t = (en, ru) => (lang === "en" ? en : ru);
    await tab.setContent(page(t));
    const file = join(repo, "book", "img", `iti-pipeline${suffix}.png`);
    await tab.locator("#pic").screenshot({path: file});
    console.log(`iti-diagram: ${file}`);
  }
} finally {
  await browser.close();
}
