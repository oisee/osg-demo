# 14. Мой ABAP сбежал с сервера

До сих пор все работало внутри системы: локальной, в VS Code, но системы, с ее
сервером, базой данных и сеансами. Эта глава выносит из нее один классический
отчет. **osabap** из open-steamgate компилирует исполняемый отчет через
транспайлер ABAP в Go в одну нативную программу: без сервера, без среды
выполнения, которую надо ставить, один файл, который можно скопировать на
другую машину.

## Во что превращается отчет

```text
zosd_fleet_cli.prog.abap
  -> the report converter (a class with the report's lifecycle)
  -> gogen (typed IR, then Go for the report and its small runtime closure)
  -> go build
  -> fleet: one native executable (Linux, macOS, Windows; cross-compiled)
```

Экран выбора остается интерфейсом программы, в трех видах:

- **командная строка**: каждый `PARAMETERS` и `SELECT-OPTIONS` становится
  опцией, `--status M`, `--seed`, `--file ships.csv`; список (`WRITE`) идет в
  stdout, сообщения - в stderr, код выхода 0, 1 (ошибка выполнения) или 2
  (неподдерживаемая операция);
- **форма в терминале** (TUI): запущенная без аргументов в терминале,
  программа показывает экран выбора как форму;
- **SAP GUI**: `-sapgui` отдает тот же экран выбора настоящему SAP GUI по DIAG
  на локальной машине.

Два дефиса - опции отчета (`--status`), один дефис - флаги хоста (`-db`,
`-allow-read`, `-help`), так что опция отчета никогда не столкнется с флагом,
который хост получит позже.

Отчет этой главы, [ZOSD_FLEET_CLI](../../cli/fleet/zosd_fleet_cli.prog.abap),
лежит в `cli/`, а не в паке: это отдельная программа. Его таблицы - таблицы
флота `ZOSD_FLEET_SHIP` и `ZOSD_FLEET_STAT`, при сборке они копируются из
`src/ddic`.

## Сборка

В checkout open-steamgate с Go 1.26 в PATH и библиотеками на своих версиях
(`npm run bootstrap`):

```sh
OSD_HOME=/path/to/open-steamgate node test/cli.mjs --keep /tmp/fleet-cli
```

Скрипт кладет отчет рядом с определениями таблиц, запускает на нем
`node tools/gogen/osabap.mjs` из open-steamgate, копирует результат в
`/tmp/fleet-cli/run/fleet` и прогоняет шаги ниже как проверки. Для другой
платформы задайте `GOOS`/`GOARCH` (например, `GOOS=windows GOARCH=arm64`). В
VS Code F8 на отчете (`osd run`) собирает и запускает его так же.

## Запуск

1. `./fleet -help`. Ожидается: экран выбора в виде опций, затем флаги хоста.

   ![Экран выбора становится опциями команды](../img/cli-help.png)

2. `./fleet --status A`. Ожидается: отказ с кодом выхода 1, `keeps its rows in
   tables (ZOSD_FLEET_SHIP, ZOSD_FLEET_STAT): run it with -db FILE`. Отчет с
   таблицами никогда не получает молча базу в памяти.
3. `./fleet -db fleet.sqlite --seed`. Ожидается: `Seeded 6 ships and 3
   statuses` и шесть кораблей. Файл SQLite создается с таблицами отчета;
   повторный `--seed` говорит `Already 6 ships, nothing seeded`.
4. `./fleet -db fleet.sqlite --status M`. Ожидается: `S004 Cumulus` и
   `S006 Old Boiler`, `2 ships`.
5. `./fleet -db fleet.sqlite --file data/ships.csv`. Ожидается:
   `Permission denied: no dataset root allows this`. `OPEN DATASET` работает в
   песочнице: без разрешения отказывается любой файл.
6. `./fleet -db fleet.sqlite -allow-read data -dataset-home data --file ships.csv`.
   Ожидается: `Loaded 2 ships from ships.csv`; `S004 Cumulus` теперь `Docked`,
   и появился седьмой корабль, `S007 Zephyr`.

   ![Один сеанс: отказ без -db, начальные данные, фильтр, отказ и затем разрешение читать файл](../img/cli-session.png)

## Та же программа в виде формы

Запустите ее в терминале без опций отчета: `./fleet -db fleet.sqlite`. Tab и
стрелки переходят между полями, Space переключает флажок, Enter запускает, Esc
отменяет. Введите `M` в поле статуса и нажмите Enter:

![Экран выбора как форма в терминале](../img/tui-form.png)

![Список после Enter](../img/tui-result.png)

Без терминала (канал, CI) программа спрашивает поля построчно, так что тот же
бинарник работает в скриптах. Подписи полей - имена параметров: тексты экрана
выбора отчета osabap пока не читает.

## Что она умеет и чего нет (open-steamgate 0.4)

- **Open SQL только на собственных таблицах отчета**, в файле, который
  называет `-db`; каждый запуск - один LUW, `COMMIT WORK` и `ROLLBACK WORK`
  работают. Из восемнадцати измеренных форм операторов компилируются
  двенадцать. Пишите простой `SELECT ... INTO TABLE` в стандартные таблицы:
  агрегат в скаляр, кроме `COUNT(*)`, `UP TO ... ORDER BY`, `APPENDING TABLE`,
  сортированная целевая таблица, цикл `SELECT` с `GROUP BY` и встроенные
  `@DATA( )` пока не компилируются, и любая из них делает недоступным весь
  метод.
- **Файлы** через `OPEN`/`READ`/`TRANSFER DATASET` и `CL_GUI_FRONTEND_SERVICES`,
  внутри корней, которые разрешают `-allow-read` / `-allow-write`.
- **Классы** рядом с отчетом или из папок `--lib`; классы open-abap-core,
  которые он называет, подтягиваются сами.
- **Один экран выбора и один запуск** на процесс; справки F4, всплывающих окон
  и интерактивных списков (`AT LINE-SELECTION`) пока нет; HTTP, OData и ICF
  нет.
- В шаблоне `CP` символ `#` - экранирующий: строка, начинающаяся с `#`, это
  `CP '##*'`, а не `CP '#*'`, здесь так же, как в системе.

Спецификация - в
[docs/osabap-native.md](https://github.com/oisee/open-steamgate/blob/main/docs/osabap-native.md)
open-steamgate.

## Под капотом

Вся логика программы - это `START-OF-SELECTION` отчета:

<!-- code: cli/fleet/zosd_fleet_cli.prog.abap lines 29-60 -->
```abap
START-OF-SELECTION.
  IF p_seed = abap_true.
    SELECT COUNT(*) FROM zosd_fleet_ship INTO gv_count.
    IF gv_count = 0.
      PERFORM seed.
      WRITE: / 'Seeded 6 ships and 3 statuses'.
    ELSE.
      WRITE: / 'Already', gv_count, 'ships, nothing seeded'.
    ENDIF.
  ENDIF.

  IF p_file IS NOT INITIAL.
    PERFORM load.
  ENDIF.

  IF p_status IS INITIAL.
    SELECT * FROM zosd_fleet_ship INTO TABLE gt_ships.
  ELSE.
    SELECT * FROM zosd_fleet_ship INTO TABLE gt_ships WHERE status = p_status.
  ENDIF.
  SELECT * FROM zosd_fleet_stat INTO TABLE gt_stats.
  SORT gt_ships BY ship_id.
  LOOP AT gt_ships INTO gs_ship.
    CLEAR gv_text.
    READ TABLE gt_stats INTO gs_stat WITH KEY status = gs_ship-status.
    IF sy-subrc = 0.
      gv_text = gs_stat-text.
    ENDIF.
    WRITE: / gs_ship-ship_id, gs_ship-name, gv_text, gs_ship-steam_pct, gs_ship-home_port.
  ENDLOOP.
  gv_count = lines( gt_ships ).
  WRITE: / gv_count, 'ships'.
```

И импорт CSV, обычные операторы `DATASET`:

<!-- code: cli/fleet/zosd_fleet_cli.prog.abap lines 97-121 -->
```abap
FORM load.
  OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING UTF-8 MESSAGE gv_msg.
  IF sy-subrc <> 0.
    WRITE: / 'Cannot read', p_file, gv_msg.
    RETURN.
  ENDIF.
  DO.
    READ DATASET p_file INTO gv_line.
    IF sy-subrc <> 0.
      EXIT.
    ENDIF.
    IF gv_line IS INITIAL OR gv_line CP '##*'.
      CONTINUE.
    ENDIF.
    CLEAR gs_ship.
    gs_ship-mandt = sy-mandt.
    SPLIT gv_line AT ',' INTO gs_ship-ship_id gs_ship-name gs_ship-status gv_steam gs_ship-home_port.
    gs_ship-steam_pct = gv_steam.
    MODIFY zosd_fleet_ship FROM gs_ship.
    gv_loaded = gv_loaded + 1.
  ENDDO.
  CLOSE DATASET p_file.
  COMMIT WORK.
  WRITE: / 'Loaded', gv_loaded, 'ships from', p_file.
ENDFORM.
```
