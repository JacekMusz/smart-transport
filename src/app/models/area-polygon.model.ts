import * as L from 'leaflet';

export interface AreaPolygon {
  id: string;
  polygon: L.Polygon;
  areaM2: number;
}
