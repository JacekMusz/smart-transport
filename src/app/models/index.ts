export { BusStop, StopAreaService } from './bus-stop.model';
export { BusRoute } from './bus-route.model';
export { RoutePoint } from './route-point.model';
export { AreaPolygon } from './area-polygon.model';
export { TravelDestination } from './travel-destination.model';
export {
  Vehicle,
  VehicleSchedule,
  TripSchedule,
} from './vehicle-schedule.model';

export type AppMode =
  | 'view'
  | 'draw'
  | 'edit-stop'
  | 'edit-route'
  | 'edit-area'
  | 'edit-destination'
  | 'delete';
export type DrawType = 'stop' | 'route' | 'area' | 'destination';
