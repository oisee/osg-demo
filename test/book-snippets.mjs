// Keeps the source excerpts in the book in step with src/.
//
//   node test/book-snippets.mjs            check: exit 1 on any drift
//   node test/book-snippets.mjs --write    rewrite the excerpts from src/
//
// An excerpt in book/*.md or book/ru/*.md is a fenced code block right after
// a marker comment that names its source, relative to the repository root:
//
//   <!-- code: src/zcl_osd_fleet_report.clas.abap method steam_check -->
//   <!-- code: src/zosd_fleet_voyage.prog.abap lines 12-30 -->
//   <!-- code: src/cds/zc_osd_fleetcube.ddls.asddls -->
//
// `method <name>` takes METHOD <name> ... ENDMETHOD. with its indentation
// removed; `lines a-b` takes those lines; nothing more takes the whole file.
import {readFileSync, readdirSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const MARKER = /^<!-- code: (\S+)(?: (method) (\S+)| (lines) (\d+)-(\d+))? -->$/;

function excerpt(file, kind, a, b) {
  const lines = readFileSync(join(repo, file), "utf8").replace(/\n$/, "").split("\n");
  let part = lines;
  if (kind === "lines") part = lines.slice(Number(a) - 1, Number(b));
  if (kind === "method") {
    const start = lines.findIndex((l) => new RegExp(`^\\s*METHOD ${a.replace(/[~]/g, "\\~")}\\b`, "i").test(l));
    if (start < 0) throw new Error(`${file}: no METHOD ${a}`);
    const end = lines.findIndex((l, i) => i > start && /^\s*ENDMETHOD\./i.test(l));
    part = lines.slice(start, end + 1);
  }
  const indent = Math.min(...part.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return part.map((l) => l.slice(indent)).join("\n");
}

let drift = 0, count = 0;
for (const dir of ["book", "book/ru"]) {
  for (const name of readdirSync(join(repo, dir)).filter((n) => n.endsWith(".md")).sort()) {
    const path = join(repo, dir, name);
    const lines = readFileSync(path, "utf8").split("\n");
    let changed = false;
    for (let i = 0; i < lines.length; i++) {
      const m = MARKER.exec(lines[i].trim());
      if (!m) continue;
      count++;
      const [, file, method, mname, range, a, b] = m;
      const want = excerpt(file, method ? "method" : range ? "lines" : "", method ? mname : a, b).split("\n");
      const open = i + 1;
      if (!/^```/.test(lines[open] ?? "")) throw new Error(`${dir}/${name}:${i + 1}: no code block after the marker`);
      const close = lines.findIndex((l, j) => j > open && /^```\s*$/.test(l));
      const have = lines.slice(open + 1, close);
      if (have.join("\n") === want.join("\n")) continue;
      if (write) {
        lines.splice(open + 1, close - open - 1, ...want);
        changed = true;
      } else {
        drift++;
        console.error(`book-snippets: ${dir}/${name}:${i + 1}: ${file}${method ? ` method ${mname}` : ""}${range ? ` lines ${a}-${b}` : ""} differs from src`);
      }
    }
    if (changed) {
      writeFileSync(path, lines.join("\n"));
      console.log(`book-snippets: wrote ${dir}/${name}`);
    }
  }
}
console.log(`book-snippets: ${count} excerpts${write ? "" : `, ${drift} out of step`}`);
process.exit(drift === 0 ? 0 : 1);
