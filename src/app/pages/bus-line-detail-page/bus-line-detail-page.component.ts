import { Component, OnInit } from '@angular/core';
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
  lat: number;
  lng: number;
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
  notFound: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    // Get line ID from route params
    this.route.params.subscribe((params) => {
      const id = params['id'];
      this.lineId = id ? parseInt(id, 10) : null;
      if (this.lineId) {
        this.loadLineData();
      } else {
        this.notFound = true;
      }
    });
  }

  loadLineData(): void {
    const data = localStorage.getItem('smart-transport-data');
    if (!data) {
      this.notFound = true;
      return;
    }

    try {
      const parsed = JSON.parse(data);
      const routes = parsed.routes || [];
      const stops = parsed.stops || [];

      // Find the line by ID
      this.line = routes.find((r: BusLineData) => r.id === this.lineId);

      if (!this.line) {
        this.notFound = true;
        return;
      }

      // Load all stops
      this.stops = stops;

      // Create ordered list of stops for this line
      this.orderedStops = this.line.stopIds
        .map((stopId) => stops.find((s: BusStopData) => s.id === stopId))
        .filter((s: BusStopData | undefined) => s !== undefined);
    } catch (e) {
      console.error('Error loading line data:', e);
      this.notFound = true;
    }
  }

  goBack(): void {
    this.router.navigate(['/bus-lines']);
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
   * Calculate distance from the first stop to the given stop
   * Returns distance in meters
   */
  getDistanceFromStart(stopId: number): number {
    if (!this.line || !this.line.points || this.line.points.length < 2) {
      return 0;
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
  getTravelTime(stopId: number): number {
    const distanceMeters = this.getDistanceFromStart(stopId);
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
  getCommunicationSpeed(stopId: number): string {
    const distanceMeters = this.getDistanceFromStart(stopId);
    const timeMinutes = this.getTravelTime(stopId);

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
