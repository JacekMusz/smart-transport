import * as L from 'leaflet';

export interface RoutePoint {
  latLng: L.LatLng;
  stopId: number | null;
}
