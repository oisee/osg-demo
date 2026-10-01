// Pictures of the fleet's command line program for book chapter 14, into
// book/img/: terminal sessions of the CLI and the TUI form.
//
//   OSD_HOME=<open-steamgate checkout> node test/cli.mjs --keep /tmp/fleet-cli
//   OSD_HOME=<open-steamgate checkout> node test/cli-shots.mjs /tmp/fleet-cli
//
// The CLI shots run the binary that test/cli.mjs kept and draw command and
// output as a terminal. The TUI runs in a detached tmux session (a real
// terminal, 90x22), whose screen is captured with its colours, turned into
// HTML here and photographed with open-steamgate's Playwright Chromium.
import {spawnSync} from "node:child_process";
import {existsSync, mkdirSync, rmSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.OSD_HOME ? resolve(process.env.OSD_HOME) : "";
const kept = process.argv[2] ? resolve(process.argv[2]) : "";
if (!home || !kept) {
  console.error("cli-shots: OSD_HOME=<checkout> node test/cli-shots.mjs <dir kept by test/cli.mjs --keep>");
  process.exit(2);
}
const run = join(kept, "run");
const fail = (why) => {
  console.error(`cli-shots: ${why}`);
  spawnSync("tmux", ["kill-session", "-t", "fleet-tui"]);
  process.exit(1);
};
if (!existsSync(join(run, "fleet"))) fail(`no ${join(run, "fleet")}: run test/cli.mjs --keep ${kept} first`);
if (spawnSync("tmux", ["-V"]).status !== 0) fail("the TUI shots need tmux");
const out = join(repo, "book", "img");
mkdirSync(out, {recursive: true});

// ANSI SGR to HTML: enough for tmux's capture-pane -e and plain program output
const PALETTE = ["#1e1e1e", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5",
  "#666666", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#ffffff"];
const xterm256 = (n) => {
  if (n < 16) return PALETTE[n];
  if (n >= 232) { const v = 8 + (n - 232) * 10; return `rgb(${v},${v},${v})`; }
  const i = n - 16, c = (x) => (x === 0 ? 0 : 55 + x * 40);
  return `rgb(${c(Math.floor(i / 36))},${c(Math.floor(i / 6) % 6)},${c(i % 6)})`;
};
const escapeHtml = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function ansiToHtml(text) {
  let fg = null, bg = null, bold = false, reverse = false, html = "";
  const span = (t) => {
    if (!t) return;
    let [f, b] = reverse ? [bg ?? "#1e1e1e", fg ?? "#e5e5e5"] : [fg, bg];
    const style = [f && `color:${f}`, b && `background:${b}`, bold && "font-weight:bold"].filter(Boolean).join(";");
    html += style ? `<span style="${style}">${escapeHtml(t)}</span>` : escapeHtml(t);
  };
  const parts = text.split(/\x1b\[([0-9;]*)m/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) { span(parts[i]); continue; }
    const codes = parts[i] === "" ? [0] : parts[i].split(";").map(Number);
    for (let k = 0; k < codes.length; k++) {
      const c = codes[k];
      if (c === 0) { fg = bg = null; bold = reverse = false; }
      else if (c === 1) bold = true;
      else if (c === 22) bold = false;
      else if (c === 7) reverse = true;
      else if (c === 27) reverse = false;
      else if (c >= 30 && c <= 37) fg = PALETTE[c - 30];
      else if (c >= 90 && c <= 97) fg = PALETTE[c - 90 + 8];
      else if (c >= 40 && c <= 47) bg = PALETTE[c - 40];
      else if (c >= 100 && c <= 107) bg = PALETTE[c - 100 + 8];
      else if (c === 39) fg = null;
      else if (c === 49) bg = null;
      else if ((c === 38 || c === 48) && codes[k + 1] === 5) { (c === 38 ? (fg = xterm256(codes[k + 2])) : (bg = xterm256(codes[k + 2]))); k += 2; }
      else if ((c === 38 || c === 48) && codes[k + 1] === 2) { const v = `rgb(${codes[k + 2]},${codes[k + 3]},${codes[k + 4]})`; c === 38 ? (fg = v) : (bg = v); k += 4; }
    }
  }
  return html;
}
const page = (title, body, cols) => `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#f3efe8;font-family:"DejaVu Sans Mono",monospace}
.win{display:inline-block;margin:14px;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.25)}
.bar{background:#3c3c3c;color:#ccc;font:12px sans-serif;padding:6px 10px}
.bar i{display:inline-block;width:10px;height:10px;border-radius:5px;margin-right:6px;background:#ff5f56}
.bar i+i{background:#ffbd2e}.bar i+i+i{background:#27c93f}
pre{margin:0;padding:10px 14px;background:#1e1e1e;color:#e5e5e5;font-size:14px;line-height:1.35;min-width:${cols}ch}
.p{color:#23d18b}</style><div class="win"><div class="bar"><i></i><i></i><i></i> ${escapeHtml(title)}</div><pre>${body}</pre></div>`;

const {chromium} = createRequire(join(home, "package.json"))("playwright");
const browser = await chromium.launch(process.env.SLICE_CHROMIUM ? {executablePath: process.env.SLICE_CHROMIUM} : {});
const shoot = async (name, html) => {
  const tab = await browser.newPage({deviceScaleFactor: 2});
  await tab.setContent(html);
  await tab.locator(".win").screenshot({path: join(out, `${name}.png`)});
  await tab.close();
  console.log(`cli-shots: ${name}.png`);
};

// CLI: commands and their output, as typed in a terminal
const session = (commands) => commands.map((args) => {
  const r = spawnSync(join(run, "fleet"), args, {cwd: run, encoding: "utf8"});
  if (!`${r.stdout}${r.stderr}`.trim()) fail(`./fleet ${args.join(" ")} printed nothing`);
  const shown = args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ");
  return `<span class="p">$</span> ./fleet ${escapeHtml(shown)}\n${escapeHtml(`${r.stdout}${r.stderr}`)}`;
}).join("\n");
rmSync(join(run, "fleet.sqlite"), {force: true});
await shoot("cli-help", page("fleet: the selection screen as options", session([["-help"]]), 80));
await shoot("cli-session", page("fleet: one SQLite file, its own tables", session([
  ["--status", "A"],
  ["-db", "fleet.sqlite", "--seed"],
  ["-db", "fleet.sqlite", "--status", "M"],
  ["-db", "fleet.sqlite", "--file", "data/ships.csv"],
  ["-db", "fleet.sqlite", "-allow-read", "data", "-dataset-home", "data", "--file", "ships.csv"],
]), 80));

// TUI: the same selection screen as a form in a real terminal
const tmux = (...args) => spawnSync("tmux", args, {encoding: "utf8"});
const must = (...args) => { const r = tmux(...args); if (r.status !== 0) fail(`tmux ${args[0]}: ${r.stderr.trim()}`); return r; };
// waits until the screen shows the text, so a slow start never gives a half-drawn picture
const screenWith = async (text) => {
  for (let i = 0; i < 40; i++) {
    const screen = must("capture-pane", "-t", "fleet-tui", "-p", "-e").stdout.replace(/\n+$/, "");
    const plain = screen.replace(/\x1b\[[0-9;]*m/g, "");
    if (typeof text === "string" ? plain.includes(text) : text.test(plain)) return screen;
    await sleep(250);
  }
  fail(`the TUI never showed "${text}"`);
};
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
tmux("kill-session", "-t", "fleet-tui");
must("new-session", "-d", "-s", "fleet-tui", "-x", "90", "-y", "22", `cd '${run}' && ./fleet -db fleet.sqlite; sleep 60`);
try {
  await screenWith("Status (A, D, M)");
  must("send-keys", "-t", "fleet-tui", "M");
  await sleep(500);
  await shoot("tui-form", page("./fleet -db fleet.sqlite", ansiToHtml(await screenWith(/Status \(A, D, M\)\s+M/)), 90));
  must("send-keys", "-t", "fleet-tui", "Enter");
  // step 6 of the session above docked S004, so one ship is left in maintenance
  await shoot("tui-result", page("./fleet -db fleet.sqlite", ansiToHtml(await screenWith(/S006 Old Boiler[^\n]*\n\s*1 ships$/m)), 90));
} finally {
  tmux("kill-session", "-t", "fleet-tui");
  await browser.close();
}
