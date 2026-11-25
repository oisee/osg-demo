# 22. Флот, закреплённый дайджестом: слои OCI

До сих пор флот попадал в open-steamgate папкой. `OSD_PACKS` указывает на
этот checkout, движок читает то, что там лежит сегодня, а завтрашняя правка
становится завтрашней системой. Для разработки это удобно. Но на вопрос
эксплуатации такой подход не отвечает: *какой именно* код сейчас работает и
можно ли получить ровно его ещё раз?

open-steamgate отвечает на этот вопрос так же, как образы контейнеров.
**Слой** — это репозиторий abapGit, упакованный в ZIP с неизменными байтами и
опубликованный как артефакт OCI. **Система** — упорядоченный список слоёв:
сначала библиотеки ABAP, потом собственные исходники open-steamgate, потом
паки; каждый следующий слой перекрывает предыдущие. И каждый слой, и система
целиком называются дайджестом SHA-256 своих байтов. Установите систему по
дайджесту, и сборка каждый раз будет проверять, что установленные файлы — всё
ещё те самые, которые этот дайджест называет
([docs/oci-layers.md](https://github.com/oisee/open-steamgate/blob/vscode-stable-v0.7.3140/docs/oci-layers.md)).

В этой главе флот войдёт в такую систему, система встанет в checkout, где нет
собственных исходников, и на ней пройдут проверки книги. Всё остаётся на
вашем диске: система записывается как *OCI layout*, папка в том формате, в
каком её отдаёт реестр, и никуда не отправляется. Шаги ниже проверяет
`test/layer.mjs` (приложение A).

## Закрепите флот

Нужен checkout open-steamgate на теге книги, в котором один раз сделано
`npm ci && npm run bootstrap` (приложение A), и checkout этого репозитория.
Команды выполняются в папке этого репозитория, если шаг не говорит иное;
`$OSD_HOME` — checkout open-steamgate.

1. Соберите систему и установите её:

   ```sh
   OSD_HOME=$OSD_HOME node tools/fleet-system.mjs --out /tmp/fleet-sys --install /tmp/fleet-osg
   ```

   Ожидается: несколько строк `osd-layer: skipping .git` (по одной на
   библиотеку, их папки — клоны git), а секунд через десять — таблица из
   17 слоёв, две строки о флоте и системе и две от установки. Дайджесты
   здесь сокращены до первых 12 шестнадцатеричных цифр; скрипт печатает все 64.

   ```text
   order  kind  name              files     bytes  manifest digest
       0  lib   open-abap-core      808   1888001  sha256:ab69f46d05ee…
       1  lib   express-icf-shim     22    176817  sha256:51e6c827ae73…
       2  lib   open-abap-apc        74    150414  sha256:536d3fbeeb91…
       3  lib   abapgit            1563   7183220  sha256:4ae795f32d24…
       4  lib   open-abap-gui      1364   4604075  sha256:27c64e77d2a0…
       5  lib   open-abap-odata     155    482527  sha256:7dac156cbb73…
       6  lib   ajson                49    434527  sha256:b54706c18686…
       7  input src                1538  22515215  sha256:1abdd55d59c3…
       8  input test                987  10911009  sha256:408db17dd9d7…
       9  pack  o4d                 234  12777034  sha256:19c7780c1171…
      10  pack  zork                 35    204802  sha256:d1e74d162c07…
      11  pack  gui-examples          5      1549  sha256:680ee5ef2684…
      12  pack  rap-flight          472  14326791  sha256:7b701320b248…
      13  pack  lsd                  16   3797816  sha256:7b4fe40ab4ef…
      14  pack  zvdb                 33   5466696  sha256:22f3b5650ac4…
      15  pack  travels-a4h           7      7338  sha256:9b27bd86e805…
      16  pack  osg-demo            238   8443894  sha256:…
   fleet  treeDigest sha256:…  source https://github.com/oisee/osg-demo@<your commit>
   system sha256:…  17 layers, 93371725 bytes  /tmp/fleet-sys/index.json
   system sha256:…: 17 layers
   installed in /tmp/fleet-osg; next: cd /tmp/fleet-osg && npm start (builds, then serves)
   ```

   Первые шестнадцать строк — собственные слои open-steamgate, собранные из
   тега и закреплённых им библиотек; когда писалась глава, у них были
   показанные дайджесты. Последняя строка — флот, и дайджесты в ней ваши:
   они называют коммит, который у вас извлечён (почему — покажет шаг 3).
   Последние две строки печатает `osd-fetch --system`, который установил
   систему в `/tmp/fleet-osg`.

2. Посмотрите, что установилось:

   ```sh
   cd /tmp/fleet-osg
   ls
   ls .local/system .local/system/packs
   ```

   Ожидается: checkout open-steamgate *без* `src`, `packs`, `data` и
   `webapp`. Содержимое лежит в `.local/system/`: `libs/`, `inputs/`
   (`src` и `test`) и `packs/`, где в `osg-demo` только `osd-pack.json`,
   `src`, `data`, `webapp` и `voyage` (`ls -A` покажет ещё `.abapgit.xml` и
   `.osd-layer.json`, удостоверение слоя, которое записала установка). Книга
   и её картинки не приехали.
   `.local/system/.osd-system.json` хранит дайджест системы и для каждого
   слоя его порядок, вид, имя, дайджест манифеста и дайджест дерева.

3. Те же файлы — тот же дайджест. Вернитесь в этот репозиторий и выполните
   команду шага 1 ещё раз, с `--out /tmp/fleet-sys2` и без `--install`.
   Ожидается: та же таблица и тот же дайджест системы. Теперь измените один
   байт в seed-данных, скажем `steam_pct` корабля S002 в
   `data/zosd_fleet_ship.tabu.json`, и запустите команду в третий раз
   (`--out /tmp/fleet-sys3`). Ожидается: дайджест *всё ещё* тот же. Слой
   делается из коммита, `git archive HEAD`, а не из файлов в редакторе.
   Закоммитьте изменение и запустите ещё раз (`--out /tmp/fleet-sys4`;
   в непустую папку скрипт писать отказывается): теперь сдвигаются дайджест
   дерева флота, дайджест его манифеста и дайджест системы, а шестнадцать
   строк над ними остаются прежними. Посмотрев, отмените коммит
   (`git reset --hard HEAD~1`).

4. Соберите и запустите установленную систему:

   ```sh
   cd /tmp/fleet-osg
   STG_PORT=8099 npm start
   ```

   Ожидается, до обычных строк сервера: `osd-build: system layers verified:
   17 layers, … files, … bytes in … ms` и `osd-build: built … 3177 objects,
   live`. Первая сборка идёт примерно столько же, сколько bootstrap; сверка,
   несколько сотен миллисекунд, выполняется при каждой сборке. Откройте
   панель запуска на порту 8099: плитки **Airship fleet** и **Voyages** на
   месте, как в главах 4 и 21. Остановите сервер.

5. Прогоните на ней проверки книги, из этого репозитория:

   ```sh
   OSD_HOME=/tmp/fleet-osg SLICE_SKIP_UI=1 node test/slice.mjs
   OSD_HOME=/tmp/fleet-osg node test/rap.mjs
   ```

   Ожидается: первая строка называет систему и слой флота
   (`slice: building /tmp/fleet-osg, system sha256:…, fleet layer
   sha256:…`), дальше те же проверки, что и на checkout для разработки:
   slice — 21 пройдена и 1 пропущена, rap — 9 пройдено.

6. Попробуйте изменить работающий код. В `/tmp/fleet-osg`:

   ```sh
   OSD_PACKS=/path/to/osg-demo npm run transpile
   ```

   Ожидается: `osd-build: BAD_SYSTEM: system mode: OSD_PACKS is refused; the
   system digest supplies all layers` и `osd-build: live generation
   untouched`. Затем измените один установленный файл, например
   `.local/system/packs/osg-demo/data/zosd_fleet_ship.tabu.json`, и снова
   выполните `npm run transpile`. Ожидается: `osd-build: SYSTEM_MODIFIED:
   system layer osg-demo (pack) was modified or is unreadable; run osd-fetch
   --system again` и снова `live generation untouched`. Верните байт на
   место и запустите ещё раз: слои сверены, и сборка находит своё поколение
   уже собранным.

В конце удалите `/tmp/fleet-sys*` и `/tmp/fleet-osg`.

## Слой

`tools/fleet-system.mjs` не делает ничего, чего не умеет open-steamgate. Для
каждого слоя он вызывает `build()` из `tools/osd-layer.mjs` open-steamgate и
записывает результат туда, где его прочтёт `osd-fetch`. Слой флота — это
закоммиченные файлы пака и больше ничего:

<!-- code: tools/fleet-system.mjs lines 25-30 -->
```js
// What the pack needs, and nothing else (not the book, not the articles).
// open-steamgate's pack discovery (tools/osd-packs.mjs, packAt) reads
// osd-pack.json and the folders it names or defaults to: the ABAP in src
// (src/ddic and src/cds included), the seed rows in data, the app in webapp
// and the BSP folder voyage. .abapgit.xml keeps STARTING_FOLDER /src/.
export const PACK_FILES = ["osd-pack.json", ".abapgit.xml", "src", "data", "voyage", "webapp"];
```

<!-- code: tools/fleet-system.mjs lines 42-49 -->
```js
/** The fleet as a pack layer: the committed pack files of HEAD, named by the commit they came from. */
export function fleetLayer(osg, dir) {
  mkdirSync(dir, {recursive: true});
  const tar = spawnSync("sh", ["-c", `git -C "$1" archive HEAD ${PACK_FILES.join(" ")} | tar -x -C "$2"`, "sh", repo, dir], {encoding: "utf8"});
  if (tar.status !== 0) throw new Error(`git archive: ${tar.stderr}`);
  const source = `https://github.com/oisee/osg-demo@${git(repo, "rev-parse", "HEAD")}:.`;
  return osg.build(dir, {name: "osg-demo", kind: "pack", source});
}
```

`build()` превращает эту папку в три вещи:

- **ZIP.** Его записи *сохранены* без сжатия, отсортированы по пути,
  датированы 1980-01-01, без дополнительных полей. Одни и те же файлы всегда
  дают одни и те же байты, и в Node, и в Bun. abapGit читает такой ZIP, как
  любой другой.
- **Конфигурация**, маленький JSON: `{"schema":1,"name":"osg-demo","kind":"pack",
  "treeDigest":"sha256:…","source":{"repo":"https://github.com/oisee/osg-demo",
  "commit":"…","path":"."}}`. *Дайджест дерева* — SHA-256 от строк по одной
  на файл: собственный SHA-256 файла и его путь, отсортированные по пути. Он
  говорит «вот эти файлы», в каком бы ZIP они ни лежали.
- **Манифест**, манифест образа OCI с типом артефакта
  `application/vnd.osd.layer.v1`, который называет конфигурацию и ZIP их
  дайджестами. Собственный дайджест манифеста и есть имя слоя: закрепление.

Каждый дайджест покрывает тот, что под ним. Поэтому шаг 3 и вёл себя так.
Изменённый байт seed-данных изменил файлы, значит, и ZIP, и дайджест
дерева, значит, конфигурацию, значит, манифест. Коммит, который трогает только `book/`, не
меняет ни ZIP, ни дайджест дерева, но конфигурация называет коммит, и манифест
сдвигается. Дайджест дерева говорит *тот же флот*; дайджест манифеста —
*этот флот, из этого коммита*.

Виды слоёв — `lib`, `input`, `pack` и `customer`. Флот — пак: он приносит
ABAP, seed-строки, плитки и приложения, ровно то, что раньше `OSD_PACKS`
приносил из папки.

## Система

Система — индекс образа OCI с типом артефакта
`application/vnd.osd.system.v1`: манифесты слоёв по порядку, у каждого имя,
вид и порядок в аннотациях, и две аннотации на всю систему — коммит
open-steamgate и закреплённая версия транспайлера, с которыми она собрана:

<!-- code: tools/fleet-system.mjs lines 73-79 -->
```js
const lock = osg.readLock(osg.home);
const system = blob(Buffer.from(JSON.stringify({
  schemaVersion: 2, mediaType: osg.MEDIA.index, artifactType: "application/vnd.osd.system.v1",
  manifests: layers.map((l, order) => ({mediaType: osg.MEDIA.manifest, digest: l.digest, size: l.manifestBytes.length,
    annotations: {"org.osd.layer.name": l.config.name, "org.osd.layer.kind": l.config.kind, "org.osd.layer.order": String(order)}})),
  annotations: {"org.osd.osg.commit": git(osg.home, "rev-parse", "HEAD"), "org.osd.transpiler": `${lock.transpiler.repo}@${lock.transpiler.ref}`},
})));
```

Порядок важен: побеждает более поздний слой. Будь у флота класс с тем же
именем, что в `src`, собрался бы класс флота, а сборка назвала бы оба пути.
Флот идёт последним, после собственных паков open-steamgate.

`/tmp/fleet-sys` — OCI layout: `oci-layout`, блобы в
`blobs/sha256/<hex>` (конфигурация, ZIP и манифест каждого слоя и индекс
системы) и `index.json`, который указывает на систему. Реестр отдаёт те же
блобы по HTTP. `osd-fetch --system` принимает либо ссылку на реестр,
закреплённую дайджестом (`ghcr.io/…@sha256:…`, никогда не тег), либо такой
`index.json`. В обоих случаях он сверяет каждый блоб с дайджестом и размером,
которые называет его родитель, проверяет аннотации порядка, каноническую
форму каждого ZIP и дайджест дерева каждого слоя, распаковывает всё в
промежуточную папку и переименовывает её в `.local/system/` только когда всё
прошло. При сбое прежняя установка остаётся как была.

## От чего отказывается закреплённая система

Checkout системы читает только свои слои. Собственные `src` и `test`
checkout'а не учитываются; библиотеки берутся из `libs/`, исходники из
`inputs/`, паки из `packs/`, а `gen/` при каждой сборке генерируется из них.
Всё, что впустило бы что-то другое, запрещено: `OSD_PACKS`, `OSD_WEB_PACKS`,
`OSD_LAYERS`, любой `OSD_LIB_*`, слой `$TMP`. Прежде чем что-то использовать,
сборка снова обходит каждый установленный слой и сравнивает дайджест дерева.
Из
[tools/osd-system-verify.mjs](https://github.com/oisee/open-steamgate/blob/vscode-stable-v0.7.3140/tools/osd-system-verify.mjs)
open-steamgate:

```js
      if (treeDigest(entries) !== layer.treeDigest) throw new Error("treeDigest differs");
    } catch (cause) {
      const error = new Error(`system layer ${layer.name} (${layer.kind}) was modified or is unreadable; run osd-fetch --system again`, {cause});
      error.code = "SYSTEM_MODIFIED";
      throw error;
    }
  }
```

Обхода для разработки нет: чтобы изменить код, измените репозиторий,
закоммитьте и установите новый дайджест.

Рабочему месту говорится то же самое. По ADT блокировка установленного класса
отвечает пустым дескриптором блокировки, который клиент понимает как «не
изменяемо», а сохранение отвечает `405` с текстом
`CLAS ZCL_OSD_FLEET_REPORT is a library object and cannot be changed here`.
Создать объект в `$TMP` тоже нельзя: в режиме системы `$TMP` некуда писать.

Ещё один запрет охраняет обратное направление. Слой, собранный с
`--private` (код, который не должен покидать компанию), можно отправить
только в реестр из списка `OSD_PRIVATE_REGISTRIES` и никогда — в `ghcr.io` или
на хост GitHub Pages, есть они в списке или нет. В checkout open-steamgate:

```sh
node tools/osd-layer.mjs push ghcr.io/example/osd/osg-demo:try /path/to/osg-demo --name osg-demo --kind pack --private
```

Ожидается, после `osd-layer: skipping .git`: `osd-layer: PRIVATE_LAYER: private layer osg-demo cannot be
published to ghcr.io`, код выхода 2. Проверка — сравнение имён, сделанное
после локальной сборки и до того, как открыто хоть одно соединение.

## Проверки в обоих режимах

`test/slice.mjs` и `test/rap.mjs` раньше выставляли `OSD_PACKS` на этот
checkout, поэтому checkout системы их отвергал. Теперь они спрашивают
маленький модуль, в каком режиме `OSD_HOME`:

<!-- code: test/engine.mjs lines 20-26 -->
```js
/** The environment to build and serve with: this repository as a pack, or the system as it is installed. */
export function engineEnv(home, repo, extra = {}) {
  const env = {...process.env, ...extra};
  if (installedSystem(home)) delete env.OSD_PACKS;
  else env.OSD_PACKS = repo;
  return env;
}
```

В checkout для разработки ничего не изменилось. В checkout системы флот — это
то, что лежит в слое `osg-demo` системы, и первая строка каждой проверки
называет дайджест этого слоя, так что зелёный прогон говорит, *какой* флот был
зелёным. Если сборка падает, проверки печатают то, что напечатал
`osd-build`: свои отказы он пишет в стандартный вывод.

## Чего это не делает

- **Живых данных нет.** Система — это код, seed-строки и страницы. Строки,
  которые записали ваши пользователи, лежат в базе, а не в слое, и установка
  нового дайджеста их не забирает и не восстанавливает.
- **Реестра здесь нет.** Эта глава пишет layout на диск. Отправка — это
  `osd-layer push` и `osd-layer system push` из checkout open-steamgate.
  Каждая отправка перед выгрузкой проходит проверку на утечки, которой нужен список
  идентификаторов в `.local/leak-identifiers.json`; без него она отказывает.
  Релизный workflow тега сам публикует слои open-steamgate и систему в
  `ghcr.io/oisee/open-steamgate`; для `vscode-stable-v0.7.3140` эта проверка
  остановила публикацию, так что последняя опубликованная система — от
  `vscode-v0.7.2382`, без флота и из другого коммита.
- **В open-steamgate нет записи layout.** `osd-fetch --system` читает
  локальный layout, но на этом теге `osd-layer` пишет слои в папки, а системы
  — только в реестры. `tools/fleet-system.mjs` закрывает этот пробел
  собственным `build()` open-steamgate и рецептом его
  `scripts/system-roundtrip.mjs`.
- **Система — не снимок работающего сервера.** Она закрепляет то, что читает
  сборка. Коммит open-steamgate, с которым она собрана, записан в
  аннотациях. В git-checkout другого коммита сборка выдаёт предупреждение и
  продолжает; `/tmp/fleet-osg` сделан через `git archive` и `.git` не имеет,
  так что там сравнение пропускается.

`test/layer.mjs` повторяет эту главу примерно за полторы минуты: слой флота
собирается дважды с одинаковыми дайджестами, пишется layout, система
ставится во временный checkout и собирается, там проходят тест ABAP Unit и
чтение OData флота, а сохранение по ADT, `OSD_PACKS` и изменённый
установленный файл получают отказ. Проверка тяжёлая и в CI не входит.
