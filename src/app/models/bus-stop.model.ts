import * as L from 'leaflet';

export interface StopAreaService {
  areaId: string;
  coverage: number; // Percentage 0-100
  populationServed: number; // population * (coverage/100)
}

export interface BusStop {
  id: number;
  name: string;
  busLines: number[];
  hasShelter: boolean;
  latLng: L.LatLng;
  marker: L.Marker;
  circle?: L.Circle;
  connectedRouteIds: Set<number>;
  areas: StopAreaService[];
  nearbyDestinationIds: number[];
}
