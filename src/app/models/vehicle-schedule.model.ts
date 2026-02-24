/**
 * Represents a single trip schedule (one direction)
 */
export interface TripSchedule {
  direction: string;
  times: { stopId: number; time: string }[];
  breakEndTime: string;
}

/**
 * Represents a vehicle with its trips
 */
export interface Vehicle {
  id: string;
  name: string;
  trips: TripSchedule[];
}

/**
 * Represents the complete schedule for a bus line
 */
export interface VehicleSchedule {
  lineId: number;
  vehicles: Vehicle[];
}
