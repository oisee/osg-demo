# 12. Правила, код и доказательство

Глава 10 закончилась на L2: правило, записанное словами предметной области,
компилируется в модель L1 и формируется в ABAP. В этой главе мы пишем такое
правило для флота, а остальное делает компилятор.

## Правило

У корабля на обслуживании не должно быть рейса, вылетающего после заданной
даты. На L2 это один YAML-файл,
[maintenance_no_voyage.l2.yaml](../../src/l2/maintenance_no_voyage.l2.yaml):

<!-- code: src/l2/maintenance_no_voyage.l2.yaml lines 8-16 -->
```yaml
class: zcl_osd_fleet_l2_maint
title: A ship in maintenance has no voyage departing after the check date
for: ZOSD_FLEET_SHIP as ship
when: ship.status = 'M'
forbid:
  exists: ZOSD_FLEET_VOY as voy
  where: voy.ship_id = ship.ship_id and voy.dep_date > $date
alert: "{ship.ship_id} {ship.name}: in maintenance, voyage {voy.voyage_id} departs {voy.dep_date}"
boundaries: auto
```

`for` называет таблицу, о строках которой идет речь, `when` сужает выборку,
`forbid` называет то, чего для такой строки быть не должно, а `alert` - строку,
которую печатает каждое нарушение, с подстановками полей. Остальная часть
файла - примеры: строки для вставки, дата проверки и ожидаемые сообщения.
Правило без примеров не собирается.

Примеры используют корабли `X001`-`X003` и даты 2027 года. Начальные строки
(seed) предыдущих глав (`S004 Cumulus` на обслуживании и с рейсами) с ними не
встречаются: их рейсы вылетают в 2026 году.

## Сборка

В checkout open-steamgate:

```
node tools/dsl-l2.mjs build /path/to/osg-demo/src/l2/maintenance_no_voyage.l2.yaml \
  --out /path/to/osg-demo/src/l2 \
  --ddic /path/to/osg-demo/src/ddic --ddic .local/lars/open-abap-core/src
```

Компилятор проверяет каждую таблицу, поле и литерал по DDIC; ошибка называет
файл и строку правила (имя примера, из которого получилось бы имя метода
длиннее 30 символов, отклоняется так же). Он пишет проверочный класс
`ZCL_OSD_FLEET_L2_MAINT`, его тестовый класс и файл трассировки рядом с каждым.

## Сгенерированная проверка

<!-- code: src/l2/zcl_osd_fleet_l2_maint.clas.abap method check -->
```abap
METHOD check.
  " one query: the tables joined, never a SELECT per row of the first
  TYPES: BEGIN OF ty_join,
           ship_ship_id TYPE zosd_fleet_ship-ship_id,
           voy_voyage_id TYPE zosd_fleet_voy-voyage_id,
           ship_name TYPE zosd_fleet_ship-name,
           voy_dep_date TYPE zosd_fleet_voy-dep_date,
         END OF ty_join.
  DATA lt_join TYPE STANDARD TABLE OF ty_join WITH DEFAULT KEY.
  DATA ls_join TYPE ty_join.
  DATA lv_alert TYPE string.
  SELECT
      ship~ship_id AS ship_ship_id
      voy~voyage_id AS voy_voyage_id
      ship~name AS ship_name
      voy~dep_date AS voy_dep_date
    FROM zosd_fleet_ship AS ship
      INNER JOIN zosd_fleet_voy AS voy
        ON voy~ship_id = ship~ship_id
    INTO CORRESPONDING FIELDS OF TABLE lt_join
    WHERE ship~status = 'M'
      AND voy~dep_date > iv_date
    ORDER BY
      ship~ship_id
      voy~voyage_id.
  LOOP AT lt_join INTO ls_join.
    lv_alert = ls_join-ship_ship_id
      && ` `
      && ls_join-ship_name
      && `: in maintenance, voyage `
      && ls_join-voy_voyage_id
      && ` departs `
      && ls_join-voy_dep_date.
    APPEND lv_alert TO rt_alerts.
  ENDLOOP.
ENDMETHOD.
```

Один оператор Open SQL: две таблицы, соединенные по равенству из правила,
условия правила в `WHERE`, по одному условию на строку. Ничего в нем не
написано вручную.

## Доказательство

В тестовом классе по одному методу на пример и, поскольку в правиле указано
`boundaries: auto`, по одному на каждый граничный случай, который компилятор
вывел из типов DDIC: вылет за день до даты проверки, в этот день и через
день после (`B_DEP_DATE_LT`, `_EQ`, `_GT`), тот же, другой и пустой статус,
найденный и отсутствующий корабль, ноль и два рейса. Случай остается, только
если мутация его собственного условия меняет результат. Каждый метод
вставляет свои строки в таблицы флота, вызывает `check` и эталонную форму (то же правило, как его
написал бы человек: `SELECT` на каждый корабль), проверяет, что обе отвечают
одинаково и что ответ совпадает с `expect` примера, и снова удаляет свои
строки. Класс имеет `RISK LEVEL DANGEROUS`, потому что пишет в таблицы
правила.

1. Запустите `ZCL_OSD_FLEET_L2_MAINT` в Testing. Ожидается: пятнадцать
   зеленых методов: пять примеров (`FLAGGED`, `AN_EARLIER_VOYAGE`,
   `DEPARTS_ON_THE_CHECK_DATE`, `A_SHIP_ALOFT_IS_FINE`,
   `ONE_ALERT_PER_VOYAGE`) и десять граничных случаев `B_...`.
2. Намеренно сломайте правило: замените `voy.dep_date > $date` на
   `voy.dep_date >= $date` и соберите заново. Ожидается: сборка отказывает
   еще до того, как что-то запишет, потому что компилятор сам прогоняет
   примеры: `maintenance_no_voyage.l2.yaml:36: example "departs on the check
   date" expects [] but the rule gives ["X001 Zephyr: in maintenance, voyage
   X00003 departs 20270301"]`. Пример в день проверки - та граница, которая
   ловит ошибку. Верните `>`.
3. Теперь вместо этого отредактируйте сгенерированный код вручную: в
   `ZCL_OSD_FLEET_L2_MAINT` замените `AND voy~dep_date > iv_date` на `>=`,
   активируйте и перезапустите тесты. Ожидается: краснеют ровно два метода,
   `DEPARTS_ON_THE_CHECK_DATE` и `B_DEP_DATE_EQ` (`Expected table to contain 0
   rows, got 1`): тесты сравнивают класс с эталонной формой самого правила.
   Компилятор охраняет правило, сгенерированные тесты охраняют
   сгенерированный код. Восстановите строку.
4. `node tools/dsl-l2.mjs check <rule> --out <dir> ...` (те же флаги, что и у
   build) генерирует заново во временную папку и сравнивает побайтно; он
   завершается с кодом 1, если закоммиченный класс больше не соответствует
   своему правилу.

Класс переносится, как любой другой класс; файл правила и трассировки - это
файлы этого репозитория и не переносятся.
