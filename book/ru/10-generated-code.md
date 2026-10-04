# 10. Сгенерированный код

open-steamgate генерирует ABAP по слоям, и сгенерированная строка может
сохранить обратный путь к тому, из чего она получена:

| Слой | Что пишет человек | Что получается на выходе | В этом демо |
|---|---|---|---|
| **L0** шаблоны | шаблон в стиле Mustache и JSON-модель | текст; каждая строка прослеживается до строки шаблона и пути в модели | `ZCL_OSD_FLEET_TPL` (ниже); lift из главы 11 формирует через него код по своему рецепту |
| **L1** типизированная модель | ничего вручную: ее заполняет генератор | ABAP из рецептов; строки прослеживаются до узлов модели (`@id`), литералы типизируются по DDIC (`@type`) | пока нет; lift из главы 11 заимствует идею рецепта вручную |
| **L2** правила предметной области | правило в терминах предметной области (YAML) | модель L1, затем проверочный класс ABAP и его тестовый класс | главы 12 и 13 |

Правило между ними: **«шаблон отображает, модель решает».**

## L0: отчет по флоту из модели

[ZCL_OSD_FLEET_TPL](../../src/zcl_osd_fleet_tpl.clas.abap) генерирует отчет по
флоту, а не пишет его вручную: он читает корабли и тексты их статусов в
JSON-модель и формирует поверх нее шаблон в стиле Mustache с помощью
шаблонизатора open-steamgate `ZCL_OSD_TPL`.
Каждая выходная строка хранит трассировку (trace) к своему источнику.

1. Откройте класс и нажмите **F9**. Ожидается: `Fleet report: 6 airships`, по
   одной строке на корабль, например `S001 Albatross    Aloft       steam 82%`,
   и `End of fleet report`; затем трассировка, по одной строке на выходную
   строку, например `2 <- fleet:3 /airships/1/id`: выходная строка 2 получена
   из строки 3 шаблона `fleet` для первого дирижабля модели. Путь - это первое
   значение в строке; строка без значения, как последняя, показывает секцию,
   в которой она находится (`/`).
2. Измените шаблон в `TEMPLATE` (например, добавьте `{{status}}` в строку 3)
   и снова нажмите **F9**: меняется каждая строка корабля, а трассировка
   по-прежнему указывает на строку 3 шаблона.
3. Запустите класс в Testing. Два его HARMLESS-теста читают начальные строки
   (seed) и проверяют строку корабля и трассировку третьего корабля.

Класс остается только локальным, потому что того, что ему нужно, в этом
модуле нет: `ZCL_OSD_TPL` поставляется с open-steamgate (в системе это
обычный Z-класс, который пришлось бы сначала импортировать), а `ZCL_AJSON` -
это библиотека ajson, которая в системе может быть, а может и не быть.

## L1: типизированная модель генерации

L1 - это модель, которую заполняет генератор и по которой рецепт формирует код. Два
дополнения к обычному JSON делают ее типизированной: каждый узел, который
читает шаблон, несет стабильный `@id`
(`entity/Travel/property/TravelId`), а значение, происходящее из DDIC, несет
`@type` (встроенный тип, длина, десятичные знаки), поэтому фильтр `literal`
пишет `'0123'` для NUMC 4 и отвергает значение, которое не помещается.
Трассировку сформированного файла можно записать рядом с ним как
`<object>.trace.json`: v1 записывает выходные строки или диапазоны,
узлы/селекторы источника и координаты рецепта. Физические строки шаблона,
пути в модели и хэши идут в `.trace.meta.json` (глава 13); трассировка L0
в памяти выше по-прежнему содержит строки шаблона. Профили проверяют сформированный текст
(для ABAP: длину строки, пробелы в конце строки, 7-битные идентификаторы) и
указывают нарушение на строку шаблона, которая его вызвала.

Где вы встретите ее в open-steamgate (не в коде этого демо):

- генератор SEGW пишет целый класс `_MPC` через шаблоны L1 вместе с его
  файлом трассировки (`GenerateSet` в редакторе SEGW);
- `node tools/dsl-abap.mjs model <folder> --class <name>` считывает модель из
  существующего ABAP (методы, параметры, типы через DDIC);
- сгенерированные области внутри написанного вручную ABAP, которые
  проверяются и перезаписываются командой
  `node tools/dsl-regions.mjs check|write <path>`, и рецепты, собираемые как
  модули командой `npm run dsl:build`.

Lift из главы 11 проще, чем L1: `tools/lift.mjs` строит простую модель
(без `@id`, без `@type`) из `BEFORE`, `ZCL_OSD_TPL` формирует по шаблону рецепта
в область `AFTER`, а `test/lift.mjs` проверяет, что они остаются
согласованными; lift не сохраняет файл трассировки. `dsl-regions` из
open-steamgate может управлять такой областью со своими маркерами `osd:gen`;
это демо сохраняет свои маркеры `lift:R1`.

Спецификация - в
[docs/dsl-l1.md](https://github.com/oisee/open-steamgate/blob/main/docs/dsl-l1.md)
open-steamgate.

## L2: правило предметной области, скомпилированное в L1

L2 - это то, что пишет человек: правило в терминах предметной области, один
YAML-файл. Компилятор знает язык правил и DDIC, но ничего не знает о
предметной области. Его первый пример в open-steamgate очень похож на этот
флот:

```yaml
rule: maintenance-ship-no-future-voyage
title: A ship in maintenance has no voyage departing after the check date
for: ZOSD_L2_SHIP as ship
when: ship.status = 'M'
forbid:
  exists: ZOSD_L2_VOY as voy
  where: voy.ship_id = ship.ship_id and voy.dep_date > $date
alert: "{ship.ship_id} {ship.name}: in maintenance, voyage {voy.voyage_id} departs {voy.dep_date}"
examples:
  - name: flagged
    date: 20261001
    rows:
      ZOSD_L2_SHIP: [{ship_id: S001, name: Albatross, status: M}]
      ZOSD_L2_VOY: [{voyage_id: V00001, ship_id: S001, dep_date: 20261005}]
    expect:
      - "S001 Albatross: in maintenance, voyage V00001 departs 20261005"
```

`node tools/dsl-l2.mjs build <rule.l2.yaml> --out <dir>` проверяет каждое имя
и тип по DDIC (ошибка указывает строку правила), компилирует правило в модель
L1 и формирует проверочный класс `ZCL_L2_<RULE>` с `check( iv_date )`, а
также тестовый класс с одним методом на каждый пример. Трассировка проходит
до самого низа: строка `AND dep_date > iv_date` сгенерированного класса
указывает на строку `where:` правила. Правило обязано содержать примеры, и
собственный тест open-steamgate меняет `>` на `>=`, чтобы доказать, что
примеры это поймают.

Slice 2 делает `check` одним оператором Open SQL:
`INNER JOIN` двух таблиц по равенствам правила, тогда как slice 1 читал
вторую таблицу по разу на каждую строку первой; сгенерированный тестовый класс
сохраняет прямую форму как приватный `check_reference` и сравнивает обе на
каждом примере и выведенном случае.
Если в правиле указано
`boundaries: auto`, компилятор также выводит граничные случаи из типов DDIC
сравниваемых полей (для правила-примера: за день до даты проверки, в этот
день и через день после; тот же, другой и пустой статус; найденная и
отсутствующая связанная строка; ноль и две связанные строки) и выпускает
случай, только если мутация его собственного условия меняет результат.

Глава 12 пишет такое правило для собственных таблиц этого демо, а глава 13
прослеживает одну сгенерированную строку до него. Спецификация - в
[docs/dsl-l2.md](https://github.com/oisee/open-steamgate/blob/main/docs/dsl-l2.md)
open-steamgate.

## Под капотом

Шаблон, по которому формируется отчет по флоту:

<!-- code: src/zcl_osd_fleet_tpl.clas.abap method template -->
```abap
METHOD template.
  DATA(lv_nl) = cl_abap_char_utilities=>newline.
  rv_template = `Fleet report: {{count}} airships` && lv_nl
    && `{{#airships}}` && lv_nl
    && `{{id}} {{name | pad 12}} {{status_text | pad 11}} steam {{steam_pct}}%` && lv_nl
    && `{{/airships}}` && lv_nl
    && `End of fleet report`.
ENDMETHOD.
```

Модель, над которой он формируется, собранная из таблиц флота:

<!-- code: src/zcl_osd_fleet_tpl.clas.abap method model -->
```abap
METHOD model.
  DATA lv_index TYPE i.
  SELECT ship~ship_id, ship~name, ship~status, stat~text, ship~steam_pct
    FROM zosd_fleet_ship AS ship
    LEFT OUTER JOIN zosd_fleet_stat AS stat ON stat~status = ship~status
    ORDER BY ship~ship_id
    INTO TABLE @DATA(lt_ships).
  ri_model = zcl_ajson=>create_empty( ).
  ri_model->set_integer( iv_path = `/count` iv_val = lines( lt_ships ) ).
  ri_model->touch_array( `/airships` ).
  LOOP AT lt_ships INTO DATA(ls_ship).
    lv_index = sy-tabix.
    ri_model->set_string( iv_path = |/airships/{ lv_index }/id| iv_val = ls_ship-ship_id ).
    ri_model->set_string( iv_path = |/airships/{ lv_index }/name| iv_val = ls_ship-name ).
    ri_model->set_string( iv_path = |/airships/{ lv_index }/status| iv_val = ls_ship-status ).
    ri_model->set_string( iv_path = |/airships/{ lv_index }/status_text| iv_val = ls_ship-text ).
    ri_model->set_integer( iv_path = |/airships/{ lv_index }/steam_pct| iv_val = ls_ship-steam_pct ).
  ENDLOOP.
ENDMETHOD.
```
