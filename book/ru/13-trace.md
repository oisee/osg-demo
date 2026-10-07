# 13. Откуда эта строка?

Компилятор L2 записывает происхождение каждой сгенерированной строки рядом
с классом. В формате трассировки v1 файл
`zcl_osd_fleet_l2_maint.clas.trace.json` содержит
`"format": "osd-trace/1"` и массив `outputs`. Каждый элемент называет файл
ABAP и содержит `lines`: записи для одной строки `line` или диапазона
`lines` с включенными границами. Файл и номер выходной строки — ключ для
поиска ее происхождения.

Физические номера строк шаблона и правила, пути в скомпилированной модели и
хэши лежат отдельно, в `zcl_osd_fleet_l2_maint.clas.trace.meta.json`, с
`"format": "osd-trace-meta/1"`. Книга хранит в Git оба файла: метаданные
нужны для перехода к шаблону, а L3 сохраняет хэши версий правил для истории
сообщений.

## Пройдем по одной строке

Возьмем условие, которое делает правило правилом о датах, строку 32
проверочного класса:

<!-- code: src/l2/zcl_osd_fleet_l2_maint.clas.abap lines 32-32 -->
```abap
AND voy~dep_date > iv_date
```

Ее стабильная запись в файле трассировки:

<!-- code: src/l2/zcl_osd_fleet_l2_maint.clas.trace.json lines 286-299 -->
```json
{
  "line": 32,
  "sources": [
    {"file": "src/l2/maintenance_no_voyage.l2.yaml", "node": "rule/maintenance-ship-no-voyage/forbid/where/2", "selector": "/"},
    {"file": "src/l2/maintenance_no_voyage.l2.yaml", "node": "rule/maintenance-ship-no-voyage/forbid/where/2", "selector": "/is_cmp"},
    {"file": "src/l2/maintenance_no_voyage.l2.yaml", "node": "rule/maintenance-ship-no-voyage/forbid/where/2", "selector": "/lhs"},
    {"file": "src/l2/maintenance_no_voyage.l2.yaml", "node": "rule/maintenance-ship-no-voyage/forbid/where/2", "selector": "/op"},
    {"file": "src/l2/maintenance_no_voyage.l2.yaml", "node": "rule/maintenance-ship-no-voyage/forbid/where/2", "selector": "/pre"},
    {"file": "src/l2/maintenance_no_voyage.l2.yaml", "node": "rule/maintenance-ship-no-voyage/forbid/where/2", "selector": "/sref"}
  ],
  "locations": [
    {"recipe": "recipes/l2-check/template.tpl", "anchor": "<partial>", "offset": 0}
  ]
},
```

- `sources` называет файл правила, узел
  `rule/maintenance-ship-no-voyage/forbid/where/2` и селекторы относительно
  этого узла. Это второе сравнение в `forbid` / `where` правила.
- `locations` называет рецепт и якорь внутри него. `<partial>` — крупный
  якорь, который этот генератор использует в v1; `offset` считает выходные
  строки в одном вызове для данного узла, начиная с нуля. Это не физический
  номер строки шаблона.

Конец записи метаданных этой строки дает физические координаты:

<!-- code: src/l2/zcl_osd_fleet_l2_maint.clas.trace.meta.json lines 924-930 -->
```json
"file": "zcl_osd_fleet_l2_maint.clas.abap",
"line": 32,
"node": "rule/maintenance-ship-no-voyage/forbid/where/2",
"path": "/queries/1/where/2/pre",
"rule_line": 14,
"template": "main",
"template_line": 189
```

- `template_line` 189 — строка шаблона open-steamgate
  `recipes/l2-check/template.tpl`, которая печатает условие; номер
  сдвигается вместе с шаблоном.
- `path` — путь в скомпилированной модели L1: второе условие первого запроса.
- `rule_line` 14 — строка правила, которую написали вы:
  `where: voy.ship_id = ship.ship_id and voy.dep_date > $date`.

Остальные строки читаются так же: `INNER JOIN zosd_fleet_voy AS voy` идет от
`forbid` (строка правила 12), `ON voy~ship_id = ship~ship_id` — от первого
сравнения в `where` (строка 14), `WHERE ship~status = 'M'` — от `when`
(строка 11). У тестового класса свои трассировка и метаданные: метод каждого
примера указывает на свой пример, а каждый выведенный метод `B_...` — на
условие правила.

## Зачем это нужно

Рецензент по файлу и выходной строке находит узел правила, который ее создал.
Стабильная трассировка не содержит физических строк и хэшей, поэтому сдвиг
посторонней части шаблона не обязательно меняет трассировку при неизменном
выходном коде. С крупными якорями `<partial>` v1 не обещает стабильности
внутри измененной части, которая дает выходные строки; именованные якоря —
следующая фаза.

Метаданные записывают SHA-256 выходного файла для проверки пары, хэш модели
и хэши содержимого шаблонов. Перед переходом по физическим координатам надо
проверить, что хэш выхода совпадает с файлом ABAP: устаревшие метаданные не
дают надежного перехода. `test/l2.mjs` пересобирает и сравнивает файлы,
проверяет оба формата, совпадение хэша и происхождение условия о дате.
Проверка 17 в slice также запускает сгенерированные тесты ABAP Unit.

Прочитать стабильные записи:
`node -e "for (const o of require('./src/l2/zcl_osd_fleet_l2_maint.clas.trace.json').outputs) for (const e of o.lines) console.log(o.file, e.line ?? e.lines, e.sources)"`.

Контракт — в документации open-steamgate
[по формату трассировки v1](https://github.com/oisee/open-steamgate/blob/vscode-stable-v0.7.1696/docs/trace-format.md).
