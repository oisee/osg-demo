# 11. Lift старой процедуры

[ZCL_OSD_FLEET_LIFT](../../src/zcl_osd_fleet_lift.clas.abap) содержит процедуру в
том виде, в каком ее часто находят: `BEFORE` обходит рейсы в цикле и читает
имя каждого корабля отдельным `SELECT SINGLE`. `AFTER` - это поднятая форма из
верифицированного lift open-steamgate, рецепт R1:
один `SELECT ... FOR ALL ENTRIES` в хешированную таблицу, затем `READ TABLE`
на каждый рейс, который устанавливает имя только при попадании. Код между
`" lift:R1 begin` и `" lift:R1 end` сгенерирован, а не написан вручную.

1. В checkout open-steamgate с выполненной сборкой запустите
   `OSD_HOME=/path/to/open-steamgate node test/lift.mjs`. Ожидается: модель,
   которую он считал из `BEFORE` (`zosd_fleet_ship by ship_id; fields name ->
   ship_name`), три открытых обязательства, которые рецепт оставляет вам (нет
   параллельных записей во время цикла, один мандант, `sy-subrc`/`sy-dbcnt`
   после этого не читаются), и `AFTER's 14 generated lines match the template`.
   `--write` заново генерирует область после изменения `BEFORE`.
2. Откройте класс и нажмите **F9**. Ожидается:
   `BEFORE and AFTER agree on 20 voyages.` и первые три рейса с именами их
   кораблей, начиная с `V00001 S001 Albatross`.
3. Запустите класс в Testing. Четыре его HARMLESS-теста запускают оба метода
   на одних и тех же строках: начальные рейсы (seed), неизвестный корабль,
   который сохраняет свое старое имя, один и тот же корабль дважды с
   устаревшим именем и полное отсутствие рейсов.
4. Попробуйте это на копии `BEFORE`: добавьте в ее `WHERE` условие, которое
   не является ключевым столбцом (например, `AND status = 'A'`), или
   типизируйте компонент ключа `ship_id` иначе, чем столбец (например,
   `TYPE c LENGTH 10`), и снова выполните шаг 1: `lift: R1 refused -- ...`
   сообщает, какое обязательство не удалось закрыть. Lift проверяет типы
   ключа; целевое поле, типизированное вручную, как `ship_name`, не
   проверяется.

Тесты сравнивают результаты, а не стоимость: защита `IS NOT INITIAL` перед
`FOR ALL ENTRIES` важна только для обращений к базе данных (иначе пустая
таблица прочитала бы все корабли), и защищает ее только проверка
расхождения в шаге 1.

## Под капотом

До: одно чтение из базы на каждый рейс.

<!-- code: src/zcl_osd_fleet_lift.clas.abap method before -->
```abap
METHOD before.
  FIELD-SYMBOLS <ls_voyage> LIKE LINE OF ct_voyages.
  LOOP AT ct_voyages ASSIGNING <ls_voyage>.
    SELECT SINGLE name FROM zosd_fleet_ship INTO <ls_voyage>-ship_name
      WHERE ship_id = <ls_voyage>-ship_id.
  ENDLOOP.
ENDMETHOD.
```

После: одно чтение на все рейсы; область между маркерами сгенерирована.

<!-- code: src/zcl_osd_fleet_lift.clas.abap method after -->
```abap
METHOD after.
  FIELD-SYMBOLS <ls_voyage> LIKE LINE OF ct_voyages.
  " lift:R1 begin
  DATA lt_lookup TYPE HASHED TABLE OF zosd_fleet_ship WITH UNIQUE KEY ship_id.
  FIELD-SYMBOLS <ls_lookup> LIKE LINE OF lt_lookup.
  IF ct_voyages IS NOT INITIAL.
    SELECT ship_id name FROM zosd_fleet_ship
      INTO CORRESPONDING FIELDS OF TABLE lt_lookup
      FOR ALL ENTRIES IN ct_voyages
      WHERE ship_id = ct_voyages-ship_id.
  ENDIF.
  LOOP AT ct_voyages ASSIGNING <ls_voyage>.
    READ TABLE lt_lookup ASSIGNING <ls_lookup> WITH TABLE KEY ship_id = <ls_voyage>-ship_id.
    IF sy-subrc = 0.
      <ls_voyage>-ship_name = <ls_lookup>-name.
    ENDIF.
  ENDLOOP.
  " lift:R1 end
ENDMETHOD.
```
