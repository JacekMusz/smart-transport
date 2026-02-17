export { BusStop } from './bus-stop.model';
export { BusRoute } from './bus-route.model';
export { RoutePoint } from './route-point.model';
export { AreaPolygon } from './area-polygon.model';

export type AppMode =
  | 'view'
  | 'draw'
  | 'edit-stop'
  | 'edit-route'
  | 'edit-area'
  | 'delete';
export type DrawType = 'stop' | 'route' | 'area';
