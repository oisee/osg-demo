# 9. Фоновые задания

Аудит из главы 8 теперь выполняется в фоне: сначала как одно задание, затем
как цепочка из двух, а «доктор» объясняет, почему цепочка не движется. Задание
и цепочка используют только стандартные функциональные модули заданий («доктор» использует
собственные модули open-steamgate); ничего не выполняется, пока worker (процесс, который выполняет задания) не возьмет задание, так же как это сделал бы
фоновый рабочий процесс.

## Одно задание: аудит

Аудит также выполняется как шаг фонового задания. Для этого нужен SQLite в
файле: другие бэкенды отказываются планировать задания.

В расширении **osd: Start** также запускает обработчик на файловой базе
по умолчанию, `osd.database.system=sqlite`. Настройка `osd.jobs.worker=auto`
действует по умолчанию; `off` его выключает. Строка состояния **OSD jobs**
показывает состояние обработчика. Щелчок открывает представление **OSD Jobs**.
Для сводки в канале вывода выполните **OSD: What is running?** и выберите
**Job worker**: откроется читаемая сводка, по строке на задание,
сначала новые, с состоянием, временем начала, длительностью и счетчиками
шагов/вывода; при сбое указана причина. Сводка выводится в
**OSD: Jobs**; **Show raw job log** в этом меню или палитре команд
переключает тот же канал на JSON обработчика, а **Job worker** в **What is running?**
возвращает сводку. Выпущенные
задания выполняются без терминала. Шаги ниже используют checkout и ручной
запуск обработчика, чтобы показать очередь до и после каждого шага.

![OSD jobs: читаемая сводка завершённого задания ZOSD_FLEET_AUDIT](../img/vscode-fleet-jobs.png)

1. Запустите OSD с файловой базой данных, например
   `STG_DB=file STG_DB_PATH=/tmp/fleet.sqlite OSD_PACKS=/path/to/osg-demo npm start`
   в checkout open-steamgate.
2. Откройте [ZCL_OSD_FLEET_JOB](../../src/zcl_osd_fleet_job.clas.abap) и нажмите **F9**.
   Класс вызывает `JOB_OPEN`, отправляет отчет
   [ZOSD_FLEET_JOB](../../src/zosd_fleet_job.prog.abap) `VIA JOB` с новым run ID
   (`P_RUN`) и ожидаемым числом кораблей (`P_SHIPS`), выпускает задание через
   `JOB_CLOSE` и выводит `Fleet job ZOSD_FLEET_AUDIT <count> released; run <ID>`.
   Пока ничего не выполняется: задание ждет worker.
3. Для этого запуска из checkout выполняйте обработчик сами. В том же checkout и с
   теми же `STG_DB` и `STG_DB_PATH`, но без `OSD_PACKS` (с ним
   worker заново заполняет таблицы пака начальными строками), выполните
   `node tools/osd-batch-runs.mjs work` (или `worker`, чтобы он работал постоянно).
   Ожидается: JSON с `"kind": "completed"` и `run` со своим `"id"`
   (UUID), `"jobName": "ZOSD_FLEET_AUDIT"`, номером задания из шага 2 и
   `"state": "COMPLETED"`. `node tools/osd-batch-runs.mjs show <that run id>`
   показывает вывод шага `Fleet audit job <ID>: BAL <handle>`. Повторный `work`
   отвечает `"kind": "empty"`; так же отвечает `work`, направленный на неверный
   `STG_DB_PATH`, который молча создает новую базу данных. `"kind": "busy"`
   означает, что запуск в состоянии `RUNNING` блокирует очередь, пока его не прервут. `worker`
   выводит одну компактную строку на каждый обработанный шаг.
4. Нажмите **F9** на `ZCL_OSD_FLEET_BAL_VIEW`. Ожидается: журнал для `Run <ID>`
   с `errors 0` и тремя сообщениями аудита.

Задание использует только стандартные функциональные модули, поэтому оба объекта переносятся в
систему. Далее идут шаги цепочки заданий из
[трассировки операций флота](../../docs/fleet-operations-trace.md).

## Цепочка из двух заданий

Два задания выполняются как одна цепочка: задание готовности, которое ждет, и задание рейса, которое
его запускает. `ZCL_OSD_FLEET_CHAIN` сначала закрывает задание готовности с именованным
событием, `EVENT_ID = 'ZOSD_FLEET_VOYAGE_DONE'` и run ID в качестве
`EVENT_PARAM`, и только после этого выпускает задание рейса. Шаг рейса фиксирует
свой журнал приложения и, только если количество верное, вызывает это событие через
`BP_EVENT_RAISE` последним действием. Поскольку ожидающее задание существует до того, как
задание рейса может выполниться, быстрое задание рейса не может завершиться первым: и SAP, и
open-steamgate игнорируют вызов события, пришедший до того, как ожидающее задание было
закрыто. Run ID как параметр события разделяет параллельные цепочки. Используются только
стандартные функциональные модули; никакого собственного (private) расширения `TAIL_EVENT_*`.
Настройка та же, что выше: OSD на `STG_DB=file` и worker движка.

1. Откройте [ZCL_OSD_FLEET_CHAIN](../../src/zcl_osd_fleet_chain.clas.abap) и нажмите
   **F9**. Класс планирует две цепочки и выводит обе: `Fleet chain ok: run <A>`
   ожидает 20 рейсов, `Fleet chain forced failure: run <B>` ожидает 21. Каждая
   строка содержит номера заданий для задания рейса и для задания готовности, которое
   `waits for ZOSD_FLEET_VOYAGE_DONE`.
2. Выполняйте `node tools/osd-batch-runs.mjs work`, пока он не ответит
   `"kind": "empty"` (четыре раза). Ожидается, в каком-то порядке: рейс `A`
   `COMPLETED`, готовность `A` `COMPLETED` (всегда после рейса `A`) и
   рейс `B` `"kind": "failed"`, `FAILED` (этот `work` завершается с кодом 1).
   `node tools/osd-batch-runs.mjs list` по-прежнему показывает готовность `B` как
   `WAITING`: ее событие так и не было вызвано. Оставьте ее для доктора ниже.
   Фасад теперь поддерживает `BP_JOB_DELETE` для ждущего задания; в этом
   упражнении он не вызывается. Для нового упражнения возьмите новый каталог
   базы данных. См. [API заданий на теге](https://github.com/oisee/open-steamgate/blob/vscode-v0.6.1650/docs/job-standard-fms.md).
3. Нажмите **F9** на `ZCL_OSD_FLEET_BAL_VIEW`. Ожидается: `<A>-VOY` с
   `Voyage step OK: 20 voyages`, `<A>-READY` с
   `Fleet ready: 6 ships after a clean voyage step` и `<B>-VOY` с
   `errors 1` и `Voyage step failed: 20 voyages, expected 21`. Неуспешное
   задание рейса фиксирует свой журнал до аварийного завершения, поэтому ошибку можно прочитать;
   `<B>-READY` нет.

Это показывает гарантию планирования, а не выполнение exactly-once: перезапуск
или повторный импорт не запускает задание дважды, но сбой после бизнес-фиксации
шага и до записи его результата оставляет задание в состоянии
`RUNNING` для оператора (open-steamgate `docs/job-tail-events.md`). Событие
вызывается, когда бизнес-работа шага рейса зафиксирована, непосредственно
перед тем, как open-steamgate записывает шаг как завершенный. Поэтому сбой или прерывание после
успешного вызова события все равно запускает задание готовности, в то время как задание рейса показывает
`FAILED` или `RUNNING`; а неудачный вызов события (в системе: событие не
определено в SM64 или пользователю задания нельзя его вызывать) прерывает задание рейса
уже после того, как его журнал сообщил OK. Переносимый `BP_EVENT_RAISE` используется
намеренно; внутреннее tail-событие open-steamgate связало бы событие с
записанным результатом, но в системе его нет. Цепочка измерена на
open-steamgate; в системе она следует документированному SAP шаблону событий, но
там не измерялась ([Перенос в систему](91-take-to-system.md)).

## Почему цепочка застряла?

[ZCL_OSD_FLEET_DOCTOR](../../src/zcl_osd_fleet_doctor.clas.abap) отвечает на этот вопрос для
каждого задания готовности, которое все еще ждет. Класс выбирает их через `BP_JOB_SELECT`
(с полями `BTCSELECT` как в SAP: `PRELIM`,
`SCHEDUL` и так далее; фильтр, который локальная система не поддерживает,
например диапазон дат, вызывает `SELECTION_CANCELED`, а не игнорируется),
спрашивает «доктора» заданий open-steamgate `ZCL_OSD_JOB_DOCTOR` об ожидающем задании
и о задании рейса того же запуска (найденном по его `P_RUN`) и добавляет журнал BAL
шага рейса для этого запуска. «Доктор» заданий не связан с журналом приложения; связью служит run ID во
входных данных шага (`P_RUN`).

1. После шагов с цепочками выше на новом хранилище нажмите **F9** на классе.
   Ожидается: `Fleet chains waiting: 1` (по одной на каждую запланированную вами неуспешную цепочку;
   они остаются, пока хранилище операций не удалено), затем
   `Waiting chain <B>: ZOSD_FLEET_READY/... waits for event ZOSD_FLEET_VOYAGE_DONE`, взгляд «доктора» заданий на задание
   готовности (`OPERATIONS WAITING`, `Wait: event ZOSD_FLEET_VOYAGE_DONE`, `P_RUN=<B>`), на
   задание рейса (`OPERATIONS FAILED result=INCOMPLETE`,
   `REVIEW: failed or interrupted; no automatic replay`, `P_VOYS=21`) и
   журнал приложения `<B>-VOY` с `Voyage step failed: 20 voyages, expected 21`.
   Цепочка `A` не выводится: в ней ничего не ждет. Состояние задания рейса
   определяет, застряла ли ожидающая цепочка: `FAILED` не сдвинется, а
   `QUEUED` или `RUNNING` (F9 нажата между шагами цепочки) еще в
   пути.
2. Номера заданий, время и дескрипторы меняются при каждом запуске; «доктор» заданий также
   сообщает, что каждое чтение - отдельный снимок, а не атомарный отчет.

Класс остается только локальным: `ZCL_OSD_JOB_DOCTOR` принадлежит open-steamgate. В системе
на тот же вопрос отвечают SM37 и журнал задания.

## Под капотом

Шаг рейса, отчет, запущенный как задание: он фиксирует журнал и вызывает событие только при успехе:

<!-- code: src/zosd_fleet_voyage.prog.abap -->
```abap
* Job step 1 of the fleet chain (ZCL_OSD_FLEET_CHAIN): counts the voyages and
* records BAL log <run>-VOY. When the count matches, it commits the log and
* then raises ZOSD_FLEET_VOYAGE_DONE with the run ID, which starts the
* readiness job. A count other than P_VOYS commits the log with its error
* and aborts the job without raising the event.
REPORT zosd_fleet_voyage.

PARAMETERS p_run TYPE c LENGTH 32 OBLIGATORY.
PARAMETERS p_voys TYPE i DEFAULT 20.

START-OF-SELECTION.
  DATA lv_ok TYPE abap_bool.
  TRY.
      lv_ok = zcl_osd_fleet_chain=>voyage_step(
        iv_run_id = CONV #( p_run ) iv_expected_voyages = p_voys ).
      COMMIT WORK.
    CATCH cx_bali_runtime INTO DATA(lx_bal).
      MESSAGE lx_bal->get_text( ) TYPE 'A'.
  ENDTRY.
  IF lv_ok = abap_false.
    MESSAGE |Voyage step failed for run { p_run }; see BAL { p_run }-VOY| TYPE 'A'.
  ENDIF.
* the last thing the step does: a raise is not undone by a later ROLLBACK
  CALL FUNCTION 'BP_EVENT_RAISE'
    EXPORTING eventid = zcl_osd_fleet_chain=>c_event eventparm = p_run
    EXCEPTIONS OTHERS = 1.
  IF sy-subrc <> 0.
    MESSAGE |Voyage step { p_run } could not raise { zcl_osd_fleet_chain=>c_event }| TYPE 'A'.
  ENDIF.
  WRITE: / |Voyage step { p_run }: OK|.
```

Задание готовности закрывается первым, с run ID в качестве параметра события (задание рейса выпускается после него):

<!-- code: src/zcl_osd_fleet_chain.clas.abap lines 72-97 -->
```abap
CALL FUNCTION 'JOB_OPEN'
  EXPORTING jobname = rs_chain-ready_jobname
  IMPORTING jobcount = rs_chain-ready_count
  EXCEPTIONS OTHERS = 1.
IF sy-subrc <> 0.
  rs_chain-failed = `JOB_OPEN ready`.
  RETURN.
ENDIF.
lv_jobname = rs_chain-ready_jobname.
lv_jobcount = rs_chain-ready_count.
SUBMIT zosd_fleet_ready
  WITH p_run = iv_run_id
  VIA JOB lv_jobname NUMBER lv_jobcount AND RETURN.
IF sy-subrc <> 0.
  rs_chain-failed = `SUBMIT ready`.
  RETURN.
ENDIF.
CALL FUNCTION 'JOB_CLOSE'
  EXPORTING jobname = rs_chain-ready_jobname jobcount = rs_chain-ready_count
            event_id = c_event event_param = lv_event_param
  IMPORTING job_was_released = lv_released
  EXCEPTIONS OTHERS = 1.
IF sy-subrc <> 0 OR lv_released <> 'X'.
  rs_chain-failed = `JOB_CLOSE ready`.
  RETURN.
ENDIF.
```
