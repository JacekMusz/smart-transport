import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Vehicle, VehicleSchedule, TripSchedule } from '../../models';

interface BusLineData {
  id: number;
  name: string;
  stopIds: number[];
  points: { lat: number; lng: number; stopId: number | null }[];
}

interface BusStopData {
  id: number;
  name: string;
  busLines: number[];
  hasShelter: boolean;
  lat: number;
  lng: number;
}

@Component({
  selector: 'app-bus-line-detail-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bus-line-detail-page.component.html',
  styleUrls: ['./bus-line-detail-page.component.css'],
})
export class BusLineDetailPageComponent implements OnInit {
  lineId: number | null = null;
  line: BusLineData | null = null;
  stops: BusStopData[] = [];
  orderedStops: BusStopData[] = [];
  reversedStops: BusStopData[] = [];
  notFound: boolean = false;
  isLoading: boolean = true;
  vehicleSchedule: VehicleSchedule = { lineId: 0, vehicles: [] };
  showAddVehiclePopup: boolean = false;
  showAddTripPopup: boolean = false;
  newVehicleName: string = '';
  newTripStartTime: string = '';
  selectedVehicleId: string = '';
  selectedStartStopId: number = 0; // Starting stop for new vehicle

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    console.log('Bus Line Detail Page - Initializing...');
    // Get line ID from route params
    this.route.params.subscribe((params) => {
      const id = params['id'];
      this.lineId = id ? parseInt(id, 10) : null;
      console.log('Line ID from params:', this.lineId);
      if (this.lineId) {
        this.loadLineData();
      } else {
        this.notFound = true;
      }
    });
  }

  loadLineData(): void {
    console.log('Loading line data for line ID:', this.lineId);
    this.isLoading = true;
    const data = localStorage.getItem('smart-transport-data');
    if (!data) {
      console.warn('No smart-transport-data found in localStorage');
      this.notFound = true;
      this.isLoading = false;
      return;
    }

    try {
      const parsed = JSON.parse(data);
      const routes = parsed.routes || [];
      const stops = parsed.stops || [];

      console.log('Total routes loaded:', routes.length);
      console.log('Total stops loaded:', stops.length);

      // Find the line by ID
      this.line = routes.find((r: BusLineData) => r.id === this.lineId);

      if (!this.line) {
        console.error('Line not found with ID:', this.lineId);
        this.notFound = true;
        this.isLoading = false;
        return;
      }

      console.log('Line found:', this.line.name);

      // Load all stops
      this.stops = stops;

      // Create ordered list of stops for this line
      this.orderedStops = this.line.stopIds
        .map((stopId) => stops.find((s: BusStopData) => s.id === stopId))
        .filter((s): s is BusStopData => s !== undefined);

      console.log('Ordered stops count:', this.orderedStops.length);

      // Create reversed list for opposite direction
      this.reversedStops = [...this.orderedStops].reverse();

      // Force change detection
      this.cdr.detectChanges();

      // Load schedule from storage or generate default
      this.loadScheduleFromStorage();

      // Data loaded successfully
      this.isLoading = false;
    } catch (e) {
      console.error('Error loading line data:', e);
      this.notFound = true;
      this.isLoading = false;
    }
  }

  goBack(): void {
    this.router.navigate(['/bus-lines']);
  }

  goToCharts(): void {
    if (this.lineId) {
      this.router.navigate(['/bus-lines', this.lineId, 'charts']);
    }
  }

  /**
   * Calculate the length of the bus line in meters based on its GPS points
   * Uses the Haversine formula to calculate distance between consecutive points
   */
  getLineLength(): number {
    if (!this.line || !this.line.points || this.line.points.length < 2) {
      return 0;
    }

    let totalDistance = 0;

    for (let i = 0; i < this.line.points.length - 1; i++) {
      const point1 = this.line.points[i];
      const point2 = this.line.points[i + 1];
      totalDistance += this.haversineDistance(
        point1.lat,
        point1.lng,
        point2.lat,
        point2.lng,
      );
    }

    return totalDistance;
  }

  /**
   * Calculate distance between two GPS coordinates using Haversine formula
   * Returns distance in meters
   */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Format distance for display
   * Shows in meters if < 1000m, otherwise in kilometers
   */
  formatDistance(meters: number): string {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    } else {
      return `${(meters / 1000).toFixed(2)} km`;
    }
  }

  /**
   * Get the stop number in the route (1-indexed)
   */
  getStopNumber(stopId: number): number {
    if (!this.line) return 0;
    return this.line.stopIds.indexOf(stopId) + 1;
  }

  /**
   * Get direction label (e.g., "1->5")
   */
  getDirectionLabel(reverse: boolean = false): string {
    if (!this.line || this.line.stopIds.length === 0) {
      return '';
    }

    const firstId = this.line.stopIds[0];
    const lastId = this.line.stopIds[this.line.stopIds.length - 1];

    return reverse ? `${lastId}->${firstId}` : `${firstId}->${lastId}`;
  }

  /**
   * Calculate distance from the first stop to the given stop
   * Returns distance in meters
   */
  getDistanceFromStart(stopId: number, reverse: boolean = false): number {
    if (!this.line || !this.line.points || this.line.points.length < 2) {
      return 0;
    }

    // For reverse direction, calculate from the end
    if (reverse) {
      const totalLength = this.getLineLength();
      const forwardDistance = this.getDistanceFromStart(stopId, false);
      return totalLength - forwardDistance;
    }

    // Find the index of the first point with this stopId
    const stopPointIndex = this.line.points.findIndex(
      (p) => p.stopId === stopId,
    );

    if (stopPointIndex === -1) {
      return 0;
    }

    // Calculate total distance from start to this stop
    let totalDistance = 0;
    for (let i = 0; i < stopPointIndex; i++) {
      const point1 = this.line.points[i];
      const point2 = this.line.points[i + 1];
      totalDistance += this.haversineDistance(
        point1.lat,
        point1.lng,
        point2.lat,
        point2.lng,
      );
    }

    return totalDistance;
  }

  /**
   * Calculate travel time from the first stop to the given stop
   * Assumes average speed of 21 km/h
   * Returns time in minutes
   */
  getTravelTime(stopId: number, reverse: boolean = false): number {
    const distanceMeters = this.getDistanceFromStart(stopId, reverse);
    const distanceKm = distanceMeters / 1000;
    const speedKmh = 21; // Communication speed
    const timeHours = distanceKm / speedKmh;
    const timeMinutes = timeHours * 60;
    return timeMinutes;
  }

  /**
   * Format time for display
   * Shows in minutes and seconds
   */
  formatTime(minutes: number): string {
    if (minutes === 0) {
      return '0 min';
    }
    const totalMinutes = Math.floor(minutes);
    const seconds = Math.round((minutes - totalMinutes) * 60);

    if (totalMinutes === 0) {
      return `${seconds} s`;
    } else if (seconds === 0) {
      return `${totalMinutes} min`;
    } else {
      return `${totalMinutes} min ${seconds} s`;
    }
  }

  /**
   * Calculate average communication speed from the first stop to the given stop
   * Returns formatted speed string
   */
  getCommunicationSpeed(stopId: number, reverse: boolean = false): string {
    const distanceMeters = this.getDistanceFromStart(stopId, reverse);
    const timeMinutes = this.getTravelTime(stopId, reverse);

    // For the first stop, return N/A
    if (distanceMeters === 0 || timeMinutes === 0) {
      return '-';
    }

    // Calculate speed: distance (km) / time (hours) = km/h
    const distanceKm = distanceMeters / 1000;
    const timeHours = timeMinutes / 60;
    const speedKmh = distanceKm / timeHours;

    return `${speedKmh.toFixed(1)} km/h`;
  }

  /**
   * Get the localStorage key for this line's schedule
   */
  private getScheduleStorageKey(): string {
    return `schedule-line-${this.lineId}`;
  }

  /**
   * Load schedule from localStorage or generate default
   */
  loadScheduleFromStorage(): void {
    const storageKey = this.getScheduleStorageKey();
    console.log('Loading schedule with key:', storageKey);
    const savedSchedule = localStorage.getItem(storageKey);

    if (savedSchedule) {
      try {
        this.vehicleSchedule = JSON.parse(savedSchedule);

        // Ensure proper structure
        if (!this.vehicleSchedule.lineId) {
          this.vehicleSchedule.lineId = this.lineId || 0;
        }
        if (!this.vehicleSchedule.vehicles) {
          this.vehicleSchedule.vehicles = [];
        }

        console.log('✅ Schedule loaded from localStorage:', {
          lineId: this.vehicleSchedule.lineId,
          vehicles: this.vehicleSchedule.vehicles.length,
          totalTrips: this.getTotalTripsCount(),
          data: this.vehicleSchedule,
        });

        // Force change detection after loading
        this.cdr.detectChanges();
        return;
      } catch (e) {
        console.error('❌ Error parsing saved schedule:', e);
      }
    }

    console.log('No saved schedule found, generating default');
    // If no saved schedule, generate default with one vehicle
    this.generateDefaultSchedule();
  }

  /**
   * Save schedule to localStorage
   */
  saveScheduleToStorage(): void {
    const storageKey = this.getScheduleStorageKey();

    // Ensure lineId is set before saving
    if (!this.vehicleSchedule.lineId && this.lineId) {
      this.vehicleSchedule.lineId = this.lineId;
    }

    const dataToSave = JSON.stringify(this.vehicleSchedule);
    localStorage.setItem(storageKey, dataToSave);

    console.log('💾 Schedule saved to localStorage:', {
      key: storageKey,
      lineId: this.vehicleSchedule.lineId,
      vehicles: this.vehicleSchedule.vehicles.length,
      totalTrips: this.getTotalTripsCount(),
      dataSize: dataToSave.length + ' characters',
      data: this.vehicleSchedule,
    });
  }

  /**
   * Generate default schedule with one vehicle and one cycle
   */
  generateDefaultSchedule(): void {
    console.log('🔄 Generating default schedule...');

    if (!this.line || this.orderedStops.length === 0) {
      console.warn('⚠️ Cannot generate default schedule: no line or stops');
      this.vehicleSchedule = { lineId: this.lineId || 0, vehicles: [] };
      return;
    }

    const startTimeMinutes = 6 * 60; // 6:00 AM in minutes
    const breakMinutes = 15;

    // Forward trip: first to last stop
    const forwardTrip = this.generateTrip(
      this.orderedStops,
      startTimeMinutes,
      false,
    );

    // Calculate start time for reverse trip (after forward trip + break)
    const forwardEndTime = this.parseTimeToMinutes(
      forwardTrip.times[forwardTrip.times.length - 1].time,
    );
    const reverseStartTime = forwardEndTime + breakMinutes;

    // Reverse trip: last to first stop
    const reverseTrip = this.generateTrip(
      this.reversedStops,
      reverseStartTime,
      true,
    );

    // Create first vehicle
    const vehicle: Vehicle = {
      id: this.generateVehicleId(),
      name: 'Pojazd 1',
      trips: [forwardTrip, reverseTrip],
    };

    this.vehicleSchedule = {
      lineId: this.lineId || 0,
      vehicles: [vehicle],
    };

    console.log('✅ Default schedule generated:', {
      lineId: this.vehicleSchedule.lineId,
      vehicles: 1,
      trips: 2,
    });

    // Save to localStorage
    this.saveScheduleToStorage();
  }

  /**
   * Generate a single trip schedule
   */
  private generateTrip(
    stops: BusStopData[],
    startTimeMinutes: number,
    reverse: boolean,
  ): TripSchedule {
    const times: { stopId: number; time: string }[] = [];
    let currentTime = startTimeMinutes;

    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];

      // For the first stop, use start time
      if (i === 0) {
        times.push({
          stopId: stop.id,
          time: this.formatTimeHHMM(currentTime),
        });
      } else {
        // Calculate travel time from previous stop to current stop
        const prevStop = stops[i - 1];
        const travelTime = this.getTravelTimeBetweenStops(
          prevStop.id,
          stop.id,
          reverse,
        );
        currentTime += travelTime;
        times.push({
          stopId: stop.id,
          time: this.formatTimeHHMM(currentTime),
        });
      }
    }

    // Add break time
    const breakEndTime = currentTime + 15;

    const firstStopId = stops[0].id;
    const lastStopId = stops[stops.length - 1].id;
    const direction = `${firstStopId}->${lastStopId}`;

    return {
      direction: direction,
      times: times,
      breakEndTime: this.formatTimeHHMM(breakEndTime),
    };
  }

  /**
   * Calculate travel time between two consecutive stops
   * Returns time in minutes
   */
  private getTravelTimeBetweenStops(
    fromStopId: number,
    toStopId: number,
    reverse: boolean,
  ): number {
    // Get cumulative travel times from start
    const fromTime = this.getTravelTime(fromStopId, reverse);
    const toTime = this.getTravelTime(toStopId, reverse);

    // The difference is the time between these two stops
    return Math.abs(toTime - fromTime);
  }

  /**
   * Format time in minutes to HH:MM format
   */
  private formatTimeHHMM(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * Parse time string (HH:MM) to minutes
   */
  private parseTimeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Get all stop IDs in the order they appear in the schedule
   */
  getScheduleStopIds(): number[] {
    if (this.vehicleSchedule.vehicles.length === 0) return [];
    const firstVehicle = this.vehicleSchedule.vehicles[0];
    if (firstVehicle.trips.length === 0) return [];
    return firstVehicle.trips[0].times.map((t) => t.stopId);
  }

  /**
   * Get time for a specific stop in a specific trip
   */
  getTripTime(trip: TripSchedule, stopId: number): string {
    const timeObj = trip.times.find((t) => t.stopId === stopId);
    return timeObj ? timeObj.time : '-';
  }

  /**
   * Get total number of trips across all vehicles
   */
  getTotalTripsCount(): number {
    return this.vehicleSchedule.vehicles.reduce(
      (total, vehicle) => total + vehicle.trips.length,
      0,
    );
  }

  /**
   * Generate unique vehicle ID
   */
  private generateVehicleId(): string {
    return `vehicle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Open popup to add new vehicle
   */
  openAddVehiclePopup(): void {
    // Ensure vehicleSchedule is properly initialized
    if (!this.vehicleSchedule || !this.vehicleSchedule.vehicles) {
      this.vehicleSchedule = { lineId: this.lineId || 0, vehicles: [] };
    }
    this.newVehicleName = `Pojazd ${this.vehicleSchedule.vehicles.length + 1}`;
    // Set default starting stop to first stop
    if (this.orderedStops.length > 0) {
      this.selectedStartStopId = this.orderedStops[0].id;
    }
    this.showAddVehiclePopup = true;
  }

  /**
   * Close vehicle popup
   */
  closeAddVehiclePopup(): void {
    this.showAddVehiclePopup = false;
    this.newVehicleName = '';
    this.selectedStartStopId = 0;
  }

  /**
   * Add a new vehicle with initial trip
   */
  addNewVehicle(): void {
    if (!this.newVehicleName || !this.line || this.orderedStops.length === 0) {
      return;
    }

    // Ensure vehicleSchedule is properly initialized
    if (!this.vehicleSchedule || !this.vehicleSchedule.vehicles) {
      this.vehicleSchedule = { lineId: this.lineId || 0, vehicles: [] };
    }

    const startTimeMinutes = 6 * 60; // 6:00 AM in minutes
    const breakMinutes = 15;

    // Determine if starting from first or last stop
    const isReversedStart =
      this.selectedStartStopId ===
      this.orderedStops[this.orderedStops.length - 1].id;

    let firstTrip: any;
    let secondTrip: any;

    if (isReversedStart) {
      // Start from last stop (reversed direction)
      firstTrip = this.generateTrip(this.reversedStops, startTimeMinutes, true);

      const firstEndTime = this.parseTimeToMinutes(
        firstTrip.times[firstTrip.times.length - 1].time,
      );
      const secondStartTime = firstEndTime + breakMinutes;

      secondTrip = this.generateTrip(this.orderedStops, secondStartTime, false);
    } else {
      // Start from first stop (normal direction)
      firstTrip = this.generateTrip(this.orderedStops, startTimeMinutes, false);

      const firstEndTime = this.parseTimeToMinutes(
        firstTrip.times[firstTrip.times.length - 1].time,
      );
      const secondStartTime = firstEndTime + breakMinutes;

      secondTrip = this.generateTrip(this.reversedStops, secondStartTime, true);
    }

    // Create new vehicle
    const vehicle: Vehicle = {
      id: this.generateVehicleId(),
      name: this.newVehicleName,
      trips: [firstTrip, secondTrip],
    };

    console.log(
      '➕ Adding new vehicle:',
      this.newVehicleName,
      'starting from stop:',
      this.selectedStartStopId,
    );
    this.vehicleSchedule.vehicles.push(vehicle);

    // Save to localStorage
    this.saveScheduleToStorage();

    console.log(
      '✅ Vehicle added successfully, total vehicles:',
      this.vehicleSchedule.vehicles.length,
    );

    // Close popup
    this.closeAddVehiclePopup();
  }

  /**
   * Get the minimum start time for a new trip for a specific vehicle
   */
  getMinStartTimeForVehicle(vehicleId: string): string {
    const vehicle = this.vehicleSchedule.vehicles.find(
      (v) => v.id === vehicleId,
    );
    if (!vehicle || vehicle.trips.length === 0) return '06:00';
    const lastTrip = vehicle.trips[vehicle.trips.length - 1];
    return lastTrip.breakEndTime;
  }

  /**
   * Open popup to add new trip for a vehicle
   */
  openAddTripPopup(vehicleId: string): void {
    this.selectedVehicleId = vehicleId;
    this.newTripStartTime = this.getMinStartTimeForVehicle(vehicleId);
    this.showAddTripPopup = true;
  }

  /**
   * Close trip popup
   */
  closeAddTripPopup(): void {
    this.showAddTripPopup = false;
    this.newTripStartTime = '';
    this.selectedVehicleId = '';
  }

  /**
   * Add a new trip cycle (forward + reverse) for a specific vehicle
   */
  addNewTrip(): void {
    if (
      !this.newTripStartTime ||
      !this.selectedVehicleId ||
      !this.line ||
      this.orderedStops.length === 0
    ) {
      return;
    }

    const vehicle = this.vehicleSchedule.vehicles.find(
      (v) => v.id === this.selectedVehicleId,
    );
    if (!vehicle) return;

    // Validate that start time is not earlier than minimum
    const startMinutes = this.parseTimeToMinutes(this.newTripStartTime);
    const minMinutes = this.parseTimeToMinutes(
      this.getMinStartTimeForVehicle(this.selectedVehicleId),
    );

    if (startMinutes < minMinutes) {
      alert(
        `Godzina rozpoczęcia nie może być wcześniejsza niż ${this.getMinStartTimeForVehicle(this.selectedVehicleId)}`,
      );
      return;
    }

    const breakMinutes = 15;

    // Forward trip
    const forwardTrip = this.generateTrip(
      this.orderedStops,
      startMinutes,
      false,
    );
    vehicle.trips.push(forwardTrip);

    // Calculate start time for reverse trip (after forward trip + break)
    const forwardEndTime = this.parseTimeToMinutes(
      forwardTrip.times[forwardTrip.times.length - 1].time,
    );
    const reverseStartTime = forwardEndTime + breakMinutes;

    // Reverse trip
    const reverseTrip = this.generateTrip(
      this.reversedStops,
      reverseStartTime,
      true,
    );

    console.log(
      '➕ Adding new trip to vehicle:',
      vehicle.name,
      'starting at:',
      this.newTripStartTime,
    );
    vehicle.trips.push(reverseTrip);

    // Save to localStorage
    this.saveScheduleToStorage();

    console.log(
      '✅ Trip added successfully, total trips for vehicle:',
      vehicle.trips.length,
    );

    // Close popup
    this.closeAddTripPopup();
  }

  /**
   * Manual save with confirmation message
   */
  saveManually(): void {
    this.saveScheduleToStorage();
    alert('Harmonogram został zapisany pomyślnie!');
  }

  /**
   * Delete a vehicle and all its trips
   */
  deleteVehicle(vehicleId: string): void {
    const vehicle = this.vehicleSchedule.vehicles.find(
      (v) => v.id === vehicleId,
    );
    if (!vehicle) return;

    const confirmDelete = confirm(
      `Czy na pewno chcesz usunąć pojazd "${vehicle.name}" i wszystkie jego przejazdy?`,
    );

    if (confirmDelete) {
      console.log('🗑️ Deleting vehicle:', vehicle.name);
      this.vehicleSchedule.vehicles = this.vehicleSchedule.vehicles.filter(
        (v) => v.id !== vehicleId,
      );

      // Save to localStorage
      this.saveScheduleToStorage();

      alert('Pojazd został usunięty.');
      console.log(
        '✅ Vehicle deleted, remaining vehicles:',
        this.vehicleSchedule.vehicles.length,
      );
    }
  }

  /**
   * Delete a specific trip cycle (both directions) from a vehicle
   */
  deleteTrip(vehicleId: string, tripIndex: number): void {
    const vehicle = this.vehicleSchedule.vehicles.find(
      (v) => v.id === vehicleId,
    );
    if (!vehicle || !vehicle.trips[tripIndex]) return;

    const trip = vehicle.trips[tripIndex];

    // Determine if this is an even or odd trip (to find the pair)
    const isForwardTrip = tripIndex % 2 === 0;
    const pairIndex = isForwardTrip ? tripIndex + 1 : tripIndex - 1;
    const pairTrip = vehicle.trips[pairIndex];

    if (!pairTrip) {
      alert(
        'Nie można znaleźć pary przejazdu. Usuń pojedynczy przejazd ręcznie.',
      );
      return;
    }

    const confirmDelete = confirm(
      `Czy na pewno chcesz usunąć cały cykl przejazdów:\n${trip.direction}\n${pairTrip.direction}?`,
    );

    if (confirmDelete) {
      console.log(
        '🗑️ Deleting trip cycle:',
        trip.direction,
        'and',
        pairTrip.direction,
        'from vehicle:',
        vehicle.name,
      );

      // Remove both trips (remove higher index first to avoid index shift)
      const firstIndex = Math.min(tripIndex, pairIndex);
      const secondIndex = Math.max(tripIndex, pairIndex);

      vehicle.trips.splice(secondIndex, 1);
      vehicle.trips.splice(firstIndex, 1);

      // Save to localStorage
      this.saveScheduleToStorage();

      alert('Cykl przejazdów został usunięty.');
      console.log(
        '✅ Trip cycle deleted, remaining trips for vehicle:',
        vehicle.trips.length,
      );
    }
  }
}
