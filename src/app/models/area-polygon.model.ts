import * as L from 'leaflet';

export interface AreaPolygon {
  id: string;
  name: string | null;
  polygon: L.Polygon;
  areaM2: number;
  population: number;
  highPercentageOfElderly: boolean;
  servingLines: string[];
  populationDensity: number;
  publicTransportUsagePercent: number;
  destinationIds: number[];
}
