# Running open-steamgate on HANA

The local SQLite path is the quickest way through this demo. For HANA, use a local HANA Express laboratory and the open-steamgate HANA backend. The core [AMDP guide](https://github.com/oisee/open-steamgate/blob/main/docs/amdp-in-hana.md) describes the eAMDP extractor and SQLScript runner; the [database backend guide](https://github.com/oisee/open-steamgate/blob/main/docs/db-backends.md) describes the runtime database seam.

## Start and connect

1. Start your HANA Express container under its own license terms and wait for its startup completion message. A measured startup on one development machine took about **169 seconds**. This is an observation, not a readiness deadline.
2. In VS Code, set `osd.database.system` to `hana` (or `osd.database.tests` to `hana` for test runs only). Set `osd.database.hana.host`, `.port`, `.user`, and `.schema` to your laboratory connection. Use **osd: Set database password (HANA)**; the extension keeps it in VS Code SecretStorage and passes it as `HANA_PASSWORD` in the child process environment. Do not put it in `settings.json`, shell history, or this repository.
3. In a terminal, set `STG_DB=hana`, `HANA_HOST`, `HANA_PORT`, `HANA_USER`, `HANA_SCHEMA`, and `HANA_PASSWORD` in the process environment, then start open-steamgate with this pack as a layer. `OSD_HANA_PASSWORD_FILE` can point to a local secret file instead of an environment password. Keep that file outside version control. `HXE_*` variables are also accepted as fallbacks by the HANA client.
4. Use a dedicated schema. `STG_DB_FRESH=1` or `osd.database.hana.fresh` recreates it; use that only when you intend to discard its existing objects and rows. A first schema plus seed run was about **17 minutes** in the current development setup; leave time for it, and check startup progress before assuming a timeout means a failed seed. The extension derives a separate default schema from `osd.home` when one is not set.

## What to expect

Open SQL and the local OData runtime can use HANA for the same demo flow. eAMDP takes a method's SQLScript body and runs it as a HANA procedure or function; HANA is required for that path. The portable AMDP path supports a limited subset and must be checked per example. A detached ABAP Unit run can use HANA through `osd.database.tests`; choose a separate test schema so tests do not write to an application schema. HANA startup and first seeding dominate the first run, so subsequent source edits are a better measure of the ABAP loop.
