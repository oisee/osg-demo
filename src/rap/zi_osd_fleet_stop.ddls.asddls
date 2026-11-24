@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Airship fleet: the ports a voyage calls at'
define view entity ZI_OSD_FLEET_STOP as select from zosd_fleet_stop
  association to parent ZI_OSD_FLEET_VOYAGE as _Voyage
    on $projection.voyage_uuid = _Voyage.voyage_uuid
{
  key stop_uuid,
      voyage_uuid,
      port_name,
      stop_order,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      stop_changed_at,
      _Voyage
}
