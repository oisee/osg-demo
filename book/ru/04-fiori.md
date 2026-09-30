# 4. Приложения Fiori

[webapp/](../../webapp/) из пака - это отчет-список (list report) и объектная страница (object page) Fiori Elements поверх `ZOSD_FLEET_SRV`. В нем нет кода контроллера: столбцы, фильтры и фасеты берутся из аннотаций в YAML. SAPUI5 загружается с ui5.sap.com, поэтому браузер должен иметь к нему доступ.

1. Откройте панель запуска (launchpad) (`http://localhost:8099/app/flp.html`) и нажмите плитку **Airship fleet**. Ожидается: адрес заканчивается на `#AirshipFleet-display`, отчет-список открывается внутри панели запуска и показывает шесть кораблей с полями Ship, Name, Status (сначала текст, например `Aloft (A)`), Steam (%) и Home port.
2. В панели фильтров откройте справку по значениям для **Status**, выберите `Maintenance` и нажмите **Go**. Ожидается: Cumulus и Old Boiler. Справка по значениям показывает три статуса из `StatusVHSet`.
3. Нажмите **Old Boiler**. Ожидается: объектная страница показывает его общие данные и пустую таблицу **Voyages**. Вернитесь и откройте **Albatross**: в его таблице **Voyages** шесть рейсов.
4. Плитка проходит через панель запуска так же, как в системе: `#AirshipFleet-display` - это intent, который [manifest](../../webapp/manifest.json) приложения объявляет в `crossNavigation.inbounds`, а панель запуска открывает компонент `osd.fleet` из BSP-копии приложения, `/sap/bc/ui5_ui5/sap/zosg_demo/`. То же приложение работает и автономно по адресу `http://localhost:8099/app/osg-demo/`; см. [контракт](../../docs/fleet-contract.md#app).
