import * as L from 'leaflet';

export interface BusStop {
  id: number;
  name: string;
  busLines: number[];
  hasShelter: boolean;
  latLng: L.LatLng;
  marker: L.Marker;
  circle?: L.Circle;
  connectedRouteIds: Set<number>;
}
