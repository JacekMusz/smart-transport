import * as L from 'leaflet';

export interface BusStop {
  id: string;
  name: string;
  latLng: L.LatLng;
  marker: L.Marker;
  circle?: L.Circle;
  connectedRouteIds: Set<string>;
}
