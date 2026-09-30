// Generates or checks the lifted region of ZCL_OSD_FLEET_LIFT=>AFTER with
// open-steamgate's verified lift, recipe R1:
//
//   OSD_HOME=<open-steamgate checkout> node test/lift.mjs [--write]
//
// tools/lift.mjs reads the model out of BEFORE (the fleet tables' DDIC from
// src/ddic, MANDT's data element from open-abap-core), ZCL_OSD_TPL renders
// recipes/r1-lookup-enrich/template.tpl from it, and the result must be the
// region between `" lift:R1 begin` and `" lift:R1 end`. With --write the
// region is replaced instead. It prints the model's open obligations, which
// the recipe leaves to the reader by design. The engine checkout needs a
// transpile (npm run bootstrap or the smoke's build).
import {readFileSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.OSD_HOME ? resolve(process.env.OSD_HOME) : "";
if (home === "") {
  console.error("lift: set OSD_HOME to an open-steamgate checkout");
  process.exit(2);
}
const CLASS = join(repo, "src", "zcl_osd_fleet_lift.clas.abap");
const load = (file) => import(pathToFileURL(join(home, file)).href);

process.chdir(home);
const {modelR1} = await load("tools/lift.mjs");
let model;
try {
  model = modelR1(CLASS, "before", [join(repo, "src", "ddic"), join(home, ".local/lars/open-abap-core/src")]);
} catch (e) {
  // the lift refuses by throwing, with the obligation it could not close
  if (e.name !== "Refusal" && e.constructor?.name !== "Refusal") throw e;
  console.error(`lift: R1 refused -- ${e.message}`);
  process.exit(1);
}
const {initializeABAP} = await load("output/init.mjs");
await initializeABAP();
const box = (value) => new globalThis.abap.types.String().set(value);
const data = await globalThis.abap.Classes.ZCL_AJSON.parse({iv_json: box(JSON.stringify(model))});
const result = await globalThis.abap.Classes.ZCL_OSD_TPL.render({
  iv_template: box(readFileSync(join(home, "recipes/r1-lookup-enrich/template.tpl"), "utf8")), ii_data: data});
const rendered = (await globalThis.abap.Classes.ZCL_OSD_TPL.to_string({is_result: result})).get();

const source = readFileSync(CLASS, "utf8");
const eol = source.includes("\r\n") ? "\r\n" : "\n";
const lines = source.split(/\r?\n/);
const begin = lines.findIndex((l) => l.trim() === `" lift:R1 begin`);
const end = lines.findIndex((l) => l.trim() === `" lift:R1 end`);
if (begin < 0 || end < begin) {
  console.error("lift: no lift:R1 markers in AFTER");
  process.exit(1);
}
const indent = lines[begin].match(/^\s*/)[0];
const generated = rendered.replace(/\n$/, "").split("\n").map((l) => (l ? indent + l : l));
const current = lines.slice(begin + 1, end);

console.log(`lift: model ${model.source.table} by ${model.source.keys.map((k) => k.column).join(", ")}; `
  + `fields ${model.fields.map((f) => `${f.column} -> ${f.component}`).join(", ")}`);
for (const open of model.open ?? []) console.log(`lift: open obligation: ${open}`);
if (process.argv.includes("--write")) {
  writeFileSync(CLASS, [...lines.slice(0, begin + 1), ...generated, ...lines.slice(end)].join(eol));
  console.log(`lift: wrote ${generated.length} generated lines into AFTER`);
} else if (current.join("\n") !== generated.join("\n")) {
  console.error("lift: the region in AFTER is not what the template renders; run with --write and review");
  process.exit(1);
} else {
  console.log(`lift: AFTER's ${generated.length} generated lines match the template`);
}
process.exit(0);
