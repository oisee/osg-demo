@AbapCatalog.sqlViewName: 'ZVOSDFLEETCUBE'
@AbapCatalog.compiler.compareFilter: true
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'osg-demo Ch5: voyage cube by ship and month'
@Analytics.dataCategory: #CUBE
@OData.publish: true
define view ZC_OSD_FLEETCUBE
  as select from zosd_fleet_voy
{
  key voyage_id as VoyageId,
      @EndUserText.label: 'Ship'
      @UI.selectionField: [{ position: 10 }]
      ship_id as ShipId,
      @EndUserText.label: 'Month'
      @UI.selectionField: [{ position: 20 }]
      dep_month as DepMonth,
      @EndUserText.label: 'Passengers'
      @Aggregation.default: #SUM
      passengers as Passengers,
      @EndUserText.label: 'Fuel (kg)'
      @Aggregation.default: #SUM
      fuel_kg as FuelKg,
      @EndUserText.label: 'Distance (km)'
      @Aggregation.default: #SUM
      distance_km as DistanceKm
}
