import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

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
  busLoop: boolean;
  lat: number;
  lng: number;
}

interface Direction {
  label: string;
  stops: BusStopData[];
  startPointIndex: number;
}

@Component({
  selector: 'app-bus-line-detail-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bus-line-detail-page.component.html',
  styleUrls: ['./bus-line-detail-page.component.css'],
})
export class BusLineDetailPageComponent implements OnInit {
  lineId: number | null = null;
  line: BusLineData | null = null;
  stops: BusStopData[] = [];
  orderedStops: BusStopData[] = [];
  reversedStops: BusStopData[] = [];
  directions: Direction[] = [];
  notFound: boolean = false;
  isLoading: boolean = true;

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
      const allOrderedStops: BusStopData[] = this.line.stopIds
        .map((stopId) => stops.find((s: BusStopData) => s.id === stopId))
        .filter((s): s is BusStopData => s !== undefined);

      console.log('Ordered stops count:', allOrderedStops.length);

      // Build directions based on loop stops
      this.buildDirections(allOrderedStops);

      this.orderedStops = this.directions[0]?.stops ?? allOrderedStops;
      this.reversedStops = this.directions[1]?.stops ?? [];

      // Force change detection
      this.cdr.detectChanges();

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

  goToRides(): void {
    if (this.lineId) {
      this.router.navigate(['/bus-lines', this.lineId, 'rides']);
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
   * Build directions array from loop stops in the collection.
   * If two distinct loop stops are found, creates two directional segments.
   * If only one unique loop (start == end), creates one direction with all stops.
   */
  private buildDirections(allStops: BusStopData[]): void {
    if (allStops.length === 0) {
      this.directions = [];
      return;
    }

    // Find all positions of loop stops
    const loopPositions = allStops
      .map((s, i) => ({ stop: s, index: i }))
      .filter((x) => x.stop.busLoop);

    // Determine if there are two distinct loop stops
    const hasTwoDistinctLoops =
      loopPositions.length >= 2 &&
      loopPositions[0].stop.id !== loopPositions[1].stop.id;

    if (!hasTwoDistinctLoops) {
      // Single direction: show all stops
      const firstStop = allStops[0];
      const lastStop = allStops[allStops.length - 1];
      this.directions = [
        {
          label: `${firstStop.name} (${firstStop.id}) -> ${lastStop.name} (${lastStop.id})`,
          stops: allStops,
          startPointIndex: 0,
        },
      ];
      return;
    }

    // Two distinct loops: split at the second loop stop
    const splitIndex = loopPositions[1].index;
    const dir1Stops = allStops.slice(0, splitIndex + 1);
    const dir2Stops = allStops.slice(splitIndex);

    // Find GPS point index for start of direction 2
    const dir2StartStopId = dir2Stops[0].id;
    const dir2StartPointIndex = this.line?.points
      ? this.line.points.findIndex((p) => p.stopId === dir2StartStopId)
      : 0;

    this.directions = [
      {
        label: `${dir1Stops[0].name} (${dir1Stops[0].id}) -> ${dir1Stops[dir1Stops.length - 1].name} (${dir1Stops[dir1Stops.length - 1].id})`,
        stops: dir1Stops,
        startPointIndex: 0,
      },
      {
        label: `${dir2Stops[0].name} (${dir2Stops[0].id}) -> ${dir2Stops[dir2Stops.length - 1].name} (${dir2Stops[dir2Stops.length - 1].id})`,
        stops: dir2Stops,
        startPointIndex: dir2StartPointIndex >= 0 ? dir2StartPointIndex : 0,
      },
    ];
  }

  /**
   * Get direction label by index
   */
  getDirectionLabel(directionIndex: number = 0): string {
    return this.directions[directionIndex]?.label ?? '';
  }

  /**
   * Calculate distance from the start of a given direction to the specified stop
   */
  getDistanceFromDirectionStart(
    stopId: number,
    directionIndex: number,
  ): number {
    if (!this.line || !this.line.points || this.line.points.length < 2) {
      return 0;
    }
    const dir = this.directions[directionIndex];
    if (!dir) return 0;

    const startPointIdx = dir.startPointIndex;
    const stopPointIdx = this.line.points.findIndex(
      (p, i) => p.stopId === stopId && i >= startPointIdx,
    );

    if (stopPointIdx === -1) return 0;

    let totalDistance = 0;
    for (let i = startPointIdx; i < stopPointIdx; i++) {
      const p1 = this.line.points[i];
      const p2 = this.line.points[i + 1];
      totalDistance += this.haversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
    }
    return totalDistance;
  }

  /**
   * Calculate travel time from the start of a direction to the given stop (minutes)
   */
  getTravelTimeForDirection(stopId: number, directionIndex: number): number {
    const distanceMeters = this.getDistanceFromDirectionStart(
      stopId,
      directionIndex,
    );
    const distanceKm = distanceMeters / 1000;
    const speedKmh = 21;
    return (distanceKm / speedKmh) * 60;
  }

  /**
   * Calculate average communication speed for a stop in a given direction
   */
  getCommunicationSpeedForDirection(
    stopId: number,
    directionIndex: number,
  ): string {
    const distanceMeters = this.getDistanceFromDirectionStart(
      stopId,
      directionIndex,
    );
    const timeMinutes = this.getTravelTimeForDirection(stopId, directionIndex);
    if (distanceMeters === 0 || timeMinutes === 0) return '-';
    const speedKmh = distanceMeters / 1000 / (timeMinutes / 60);
    return `${speedKmh.toFixed(1)} km/h`;
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
}
