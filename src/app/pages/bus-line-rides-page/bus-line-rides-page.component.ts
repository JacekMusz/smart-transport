import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Vehicle, VehicleSchedule, TripSchedule } from '../../models';

export interface FleetBus {
  id: string;
  name: string;
  capacity: number;
}

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
  selector: 'app-bus-line-rides-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bus-line-rides-page.component.html',
  styleUrls: ['./bus-line-rides-page.component.css'],
})
export class BusLineRidesPageComponent implements OnInit {
  lineId: number | null = null;
  line: BusLineData | null = null;
  stops: BusStopData[] = [];
  orderedStops: BusStopData[] = [];
  reversedStops: BusStopData[] = [];
  directions: Direction[] = [];
  vehicleSchedule: VehicleSchedule = { lineId: 0, vehicles: [] };
  notFound: boolean = false;
  isLoading: boolean = true;

  expandedVehicles: Set<string> = new Set();
  showAddTripPopup: boolean = false;
  showAddVehiclePopup: boolean = false;
  selectedVehicleId: string = '';
  selectedFleetBusId: string = '';
  newTripStartTime: string = '06:00';

  readonly fleetBuses: FleetBus[] = [
    { id: 'f1', name: 'Mercedes Citaro (60)', capacity: 60 },
    { id: 'f2', name: 'Volvo 7900 (50)', capacity: 50 },
    { id: 'f3', name: 'Solaris Urbino 12 (45)', capacity: 45 },
    { id: 'f4', name: "MAN Lion's City (45)", capacity: 45 },
    { id: 'f5', name: 'Ikarus 280 (30)', capacity: 30 },
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const id = params['id'];
      this.lineId = id ? parseInt(id, 10) : null;
      if (this.lineId) {
        this.loadData();
      } else {
        this.notFound = true;
        this.isLoading = false;
      }
    });
  }

  loadData(): void {
    this.isLoading = true;
    const data = localStorage.getItem('smart-transport-data');
    if (!data) {
      this.notFound = true;
      this.isLoading = false;
      return;
    }

    try {
      const parsed = JSON.parse(data);
      const routes = parsed.routes || [];
      const allStopsRaw: BusStopData[] = parsed.stops || [];
      this.line = routes.find((r: BusLineData) => r.id === this.lineId) || null;

      if (!this.line) {
        this.notFound = true;
        this.isLoading = false;
        return;
      }

      this.stops = allStopsRaw;

      // Build ordered stop list for this line
      const allOrderedStops: BusStopData[] = this.line.stopIds
        .map((stopId) => allStopsRaw.find((s) => s.id === stopId))
        .filter((s): s is BusStopData => s !== undefined);

      this.buildDirections(allOrderedStops);
      this.orderedStops = this.directions[0]?.stops ?? allOrderedStops;
      this.reversedStops =
        this.directions[1]?.stops ?? [...allOrderedStops].reverse();

      // Load schedule from localStorage (same key as bus-line-detail-page)
      const scheduleKey = `schedule-line-${this.lineId}`;
      const scheduleData = localStorage.getItem(scheduleKey);
      if (scheduleData) {
        this.vehicleSchedule = JSON.parse(scheduleData);
      } else {
        this.vehicleSchedule = { lineId: this.lineId!, vehicles: [] };
      }
    } catch (e) {
      this.notFound = true;
    }

    this.isLoading = false;
  }

  // ─── Direction building ───────────────────────────────────────────────────

  private buildDirections(allStops: BusStopData[]): void {
    if (allStops.length === 0) {
      this.directions = [];
      return;
    }

    const loopPositions = allStops
      .map((s, i) => ({ stop: s, index: i }))
      .filter((x) => x.stop.busLoop);

    const hasTwoDistinctLoops =
      loopPositions.length >= 2 &&
      loopPositions[0].stop.id !== loopPositions[1].stop.id;

    if (!hasTwoDistinctLoops) {
      const first = allStops[0];
      const last = allStops[allStops.length - 1];
      this.directions = [
        {
          label: `${first.name} (${first.id}) -> ${last.name} (${last.id})`,
          stops: allStops,
          startPointIndex: 0,
        },
      ];
      return;
    }

    const splitIndex = loopPositions[1].index;
    const dir1Stops = allStops.slice(0, splitIndex + 1);
    const dir2Stops = allStops.slice(splitIndex);

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

  // ─── Distance / time helpers ─────────────────────────────────────────────

  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000;
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private getLineLength(): number {
    if (!this.line || !this.line.points || this.line.points.length < 2)
      return 0;
    let total = 0;
    for (let i = 0; i < this.line.points.length - 1; i++) {
      total += this.haversineDistance(
        this.line.points[i].lat,
        this.line.points[i].lng,
        this.line.points[i + 1].lat,
        this.line.points[i + 1].lng,
      );
    }
    return total;
  }

  private getDistanceFromStart(
    stopId: number,
    reverse: boolean = false,
  ): number {
    if (!this.line || !this.line.points || this.line.points.length < 2)
      return 0;
    if (reverse)
      return this.getLineLength() - this.getDistanceFromStart(stopId, false);
    const idx = this.line.points.findIndex((p) => p.stopId === stopId);
    if (idx === -1) return 0;
    let total = 0;
    for (let i = 0; i < idx; i++) {
      total += this.haversineDistance(
        this.line.points[i].lat,
        this.line.points[i].lng,
        this.line.points[i + 1].lat,
        this.line.points[i + 1].lng,
      );
    }
    return total;
  }

  private getTravelTime(stopId: number, reverse: boolean = false): number {
    return (this.getDistanceFromStart(stopId, reverse) / 1000 / 21) * 60;
  }

  private getTravelTimeBetweenStops(
    fromId: number,
    toId: number,
    reverse: boolean,
  ): number {
    return Math.abs(
      this.getTravelTime(toId, reverse) - this.getTravelTime(fromId, reverse),
    );
  }

  private formatTimeHHMM(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  private parseTimeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  // ─── Trip generation ──────────────────────────────────────────────────────

  private generateTrip(
    stops: BusStopData[],
    startTimeMinutes: number,
    reverse: boolean,
  ): TripSchedule {
    const times: { stopId: number; time: string }[] = [];
    let currentTime = startTimeMinutes;

    for (let i = 0; i < stops.length; i++) {
      if (i === 0) {
        times.push({
          stopId: stops[i].id,
          time: this.formatTimeHHMM(currentTime),
        });
      } else {
        currentTime += this.getTravelTimeBetweenStops(
          stops[i - 1].id,
          stops[i].id,
          reverse,
        );
        times.push({
          stopId: stops[i].id,
          time: this.formatTimeHHMM(currentTime),
        });
      }
    }

    return {
      direction: `${stops[0].id}->${stops[stops.length - 1].id}`,
      times,
      breakEndTime: this.formatTimeHHMM(currentTime + 15),
    };
  }

  // ─── Schedule persistence ─────────────────────────────────────────────────

  saveSchedule(): void {
    const scheduleKey = `schedule-line-${this.lineId}`;
    localStorage.setItem(scheduleKey, JSON.stringify(this.vehicleSchedule));
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  get totalVehicles(): number {
    return this.vehicleSchedule.vehicles.length;
  }

  get totalTrips(): number {
    return this.vehicleSchedule.vehicles.reduce(
      (sum, v) => sum + v.trips.length,
      0,
    );
  }

  // ─── Accordion ───────────────────────────────────────────────────────────

  toggleVehicle(vehicleId: string): void {
    if (this.expandedVehicles.has(vehicleId)) {
      this.expandedVehicles.delete(vehicleId);
    } else {
      this.expandedVehicles.add(vehicleId);
    }
  }

  isExpanded(vehicleId: string): boolean {
    return this.expandedVehicles.has(vehicleId);
  }

  // ─── Add Trip ─────────────────────────────────────────────────────────────

  openAddTripPopup(vehicleId: string): void {
    this.selectedVehicleId = vehicleId;
    this.newTripStartTime = this.getMinStartTimeForVehicle(vehicleId);
    this.showAddTripPopup = true;
  }

  closeAddTripPopup(): void {
    this.showAddTripPopup = false;
    this.selectedVehicleId = '';
    this.newTripStartTime = '06:00';
  }

  confirmAddTrip(): void {
    if (!this.selectedVehicleId || !this.newTripStartTime) return;
    if (!this.line || this.orderedStops.length === 0) return;

    const vehicle = this.vehicleSchedule.vehicles.find(
      (v) => v.id === this.selectedVehicleId,
    );
    if (!vehicle) return;

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

    // Forward trip starting at the selected time
    const forwardTrip = this.generateTrip(
      this.orderedStops,
      startMinutes,
      false,
    );
    vehicle.trips.push(forwardTrip);

    // Reverse trip after forward ends + 15 min break
    const forwardEndMinutes = this.parseTimeToMinutes(
      forwardTrip.times[forwardTrip.times.length - 1].time,
    );
    const reverseTrip = this.generateTrip(
      this.reversedStops,
      forwardEndMinutes + 15,
      true,
    );
    vehicle.trips.push(reverseTrip);

    this.saveSchedule();
    this.closeAddTripPopup();
  }

  getMinStartTimeForVehicle(vehicleId: string): string {
    const vehicle = this.vehicleSchedule.vehicles.find(
      (v) => v.id === vehicleId,
    );
    if (!vehicle || vehicle.trips.length === 0) return '06:00';
    const lastTrip = vehicle.trips[vehicle.trips.length - 1];
    return lastTrip.breakEndTime || '06:00';
  }

  // ─── Schedule table helpers ───────────────────────────────────────────────

  /**
   * Returns all unique stop IDs that appear across ANY trip for ANY vehicle,
   * preserving encounter order (forward stops first, then reverse-only stops appended).
   * This ensures every column exists for every row, with '-' for stops not in that trip.
   */
  getScheduleStopIds(): number[] {
    const seen = new Set<number>();
    const result: number[] = [];
    for (const vehicle of this.vehicleSchedule.vehicles) {
      for (const trip of vehicle.trips) {
        for (const t of trip.times) {
          if (!seen.has(t.stopId)) {
            seen.add(t.stopId);
            result.push(t.stopId);
          }
        }
      }
    }
    return result;
  }

  getTripTime(trip: TripSchedule, stopId: number): string {
    const timeObj = trip.times.find((t) => t.stopId === stopId);
    return timeObj ? timeObj.time : '-';
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  deleteVehicle(vehicleId: string): void {
    const vehicle = this.vehicleSchedule.vehicles.find(
      (v) => v.id === vehicleId,
    );
    if (!vehicle) return;
    if (
      !confirm(
        `Are you sure you want to delete the vehicle "${vehicle.name}" and all its rides?`,
      )
    )
      return;
    this.vehicleSchedule.vehicles = this.vehicleSchedule.vehicles.filter(
      (v) => v.id !== vehicleId,
    );
    this.expandedVehicles.delete(vehicleId);
    this.saveSchedule();
  }

  deleteTrip(vehicleId: string, tripIndex: number): void {
    const vehicle = this.vehicleSchedule.vehicles.find(
      (v) => v.id === vehicleId,
    );
    if (!vehicle || !vehicle.trips[tripIndex]) return;

    const isForwardTrip = tripIndex % 2 === 0;
    const pairIndex = isForwardTrip ? tripIndex + 1 : tripIndex - 1;
    const trip = vehicle.trips[tripIndex];
    const pairTrip = vehicle.trips[pairIndex];

    if (pairTrip) {
      if (
        !confirm(
          `Czy na pewno chcesz usunąć cały cykl przejazdów:\n${trip.direction}\n${pairTrip.direction}?`,
        )
      )
        return;
      const first = Math.min(tripIndex, pairIndex);
      const second = Math.max(tripIndex, pairIndex);
      vehicle.trips.splice(second, 1);
      vehicle.trips.splice(first, 1);
    } else {
      if (!confirm(`Czy na pewno chcesz usunąć przejazd "${trip.direction}"?`))
        return;
      vehicle.trips.splice(tripIndex, 1);
    }

    this.saveSchedule();
  }

  // ─── Add Vehicle ──────────────────────────────────────────────────────────

  openAddVehiclePopup(): void {
    this.selectedFleetBusId = '';
    this.showAddVehiclePopup = true;
  }

  closeAddVehiclePopup(): void {
    this.showAddVehiclePopup = false;
    this.selectedFleetBusId = '';
  }

  isFleetBusUsed(busId: string): boolean {
    return this.vehicleSchedule.vehicles.some((v) => v.id === busId);
  }

  confirmAddVehicle(): void {
    if (!this.selectedFleetBusId) return;
    const fleet = this.fleetBuses.find((b) => b.id === this.selectedFleetBusId);
    if (!fleet || this.isFleetBusUsed(fleet.id)) return;

    const newVehicle: Vehicle = {
      id: fleet.id,
      name: fleet.name,
      trips: [],
    };
    this.vehicleSchedule.vehicles.push(newVehicle);
    this.saveSchedule();
    this.closeAddVehiclePopup();
  }

  goBack(): void {
    this.router.navigate(['/bus-lines', this.lineId]);
  }
}
