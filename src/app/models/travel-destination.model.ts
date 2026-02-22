import * as L from 'leaflet';

export interface TravelDestination {
  id: number;
  name: string;
  latLng: L.LatLng;
  marker: L.Marker;
}
