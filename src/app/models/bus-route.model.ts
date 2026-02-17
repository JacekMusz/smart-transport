import * as L from 'leaflet';
import { RoutePoint } from './route-point.model';

export interface BusRoute {
  id: string;
  name: string;
  points: RoutePoint[];
  polyline: L.Polyline;
}
