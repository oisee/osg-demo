@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Airship fleet: voyages as a RAP business object'
define root view entity ZI_OSD_FLEET_VOYAGE as select from zosd_fleet_voyage
  composition [0..*] of ZI_OSD_FLEET_STOP as _Stops
{
  key voyage_uuid,
      ship_id,
      route,
      dep_date,
      status,
      steam_needed,
      @Semantics.systemDateTime.lastChangedAt: true
      last_changed_at,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_changed_at,
      _Stops
}
