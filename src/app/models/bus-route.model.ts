import * as L from 'leaflet';
import { RoutePoint } from './route-point.model';

export interface BusRoute {
  id: number;
  name: string;
  stopIds: number[]; // Array of stop IDs in order
  points: RoutePoint[];
  polyline: L.Polyline;
}
