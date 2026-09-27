# airfleet: operating rules (osg-demo)

Received from dell on Alice's request, 2026-09-27. Verbatim below; lessons
learned are appended at the end, one line each.

BRANCHES
- Never push to main of osg-demo or open-steamgate, never merge, never use --admin.
- Work on feat/fleet-slice (it is yours now) and on your own `af/<topic>` branches cut from origin/main.
- Never push to a branch someone else created. Branch off it instead.
- You need open-steamgate's pack-manifest fix for e2e item 5. vaporgate is turning it into vg/pack-manifest-rebase. Check that branch out locally in your open-steamgate clone to run e2e; don't push there.

CRITIC = A SUBAGENT
Before every PR, spawn a separate critic subagent (Agent tool, fresh context, read-only, no history of how you built it). Template:
"You are a critic. Read-only. Here is the diff (git diff origin/main...HEAD) and the PR draft. For each claim in the draft, find the line in the diff that supports it or mark it UNSUPPORTED. Check that names, keys and shapes match docs/fleet-contract.md. Run the e2e and confirm each assertion can fail (break the thing it checks once). Check the ABAP lint and 7-bit ASCII, stray or generated files, live identifiers, and scope beyond the stated item. For README steps, check that each 'Expected:' matches what the running system actually shows. Answer PASS or a numbered list of fixes; nothing else."
Fix what it flags and re-run it until PASS. Put the verdict in the PR body under "Critic".

DECIDE, DON'T WAIT
- A non-critical choice (seed values, texts, layout, a contract detail that turns out not to work): decide it yourself and record it in the PR body under "Decisions taken". If the contract must change, change docs/fleet-contract.md in the same PR.
- Ask Alice only about: merges, main, deleting branches or data, any SAP system, and work outside your queue.
- If something is blocked, write the question in a draft PR, post it to the relay, and move on.

CHANNEL AND TEMPO
- Relay: https://claude.ai/artifact/8VT4yKpeTwWjVoFSuY9LRb. ArtifactData, collection `messages`: read with query order_by ts desc; write with set, doc id `<epoch-ms>-airfleet`, fields from/to/kind/text/ts[/re]. vaporgate and dell read it every 11 minutes.
- Set yourself a local cron every 11 minutes (CronCreate `*/11 * * * *` or /loop 11m). Each tick:
  1. read your rules file, then `git status` + `git branch --show-current`;
  2. read the relay;
  3. take the next step of the queue.
  Never idle.
- After each finished item, give Alice one short line: the PR link, what is verified, and the decisions taken.

DURABILITY
- Save these rules as a feedback memory in your own memory dir.
- Commit them verbatim to osg-demo branch `af/rules` as `docs/airfleet-rules.md`. Push it; open no PR.
- When you learn something the hard way, add one line there.

HYGIENE
- One heavy run at a time.
- `git status` before every commit, and add files explicitly.
- In the open-steamgate clone, run `npm run transpile` before mocha after any web:vscode build. Never commit the test leftovers src/osd/zcl_osd_scratch.clas.abap or the zc_osd_pack.ddls label change.

QUEUE
1. Objective 1, the fleet slice. Six e2e assertions; PR from feat/fleet-slice.
2. Objective 2, README chapters 2–4, every step run on a live system.
3. Objective 4, the ch6 export inventory (text only).
4. Objective 3, the optional cube + AMDP chapter: only if 1–3 are done and there is time. Report the portable outcome and the HANA outcome separately.
Then stop and ask Alice.

## Lessons learned

- A table source in stg.yaml types the entity as the table: a property with no column (Ship.StatusText) cannot be filled. Serve such an entity from the DPC_EXT instead.
- abaplint's parser_error alone accepts 7.40 syntax under v702; only check_syntax with the dependencies loaded catches it. Prove the linter by planting a violation once.
- Leftover files in the engine's ignored gen/ break its build (DUPLICATE); never park scratch copies there.
- ui5.sap.com is blocked in the cloud container, so the Fiori e2e item cannot run here.
- Playwright 1.62 in the engine wants chromium_headless_shell-1234; the container has 1194 at /opt/pw-browsers.
