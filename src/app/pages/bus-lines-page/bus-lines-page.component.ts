import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface BusLineData {
  id: number;
  name: string;
  stopIds: number[];
  points: { lat: number; lng: number; stopId: number | null }[];
}

@Component({
  selector: 'app-bus-lines-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bus-lines-page.component.html',
  styleUrls: ['./bus-lines-page.component.css'],
})
export class BusLinesPageComponent implements OnInit {
  lines: BusLineData[] = [];
  isModalOpen = false;
  editingLine: BusLineData | null = null;

  // Form fields
  formName: string = '';

  // Validation
  nameError: string = '';

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.loadLinesFromLocalStorage();
  }

  loadLinesFromLocalStorage(): void {
    const data = localStorage.getItem('smart-transport-data');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        this.lines = (parsed.routes || []).sort(
          (a: BusLineData, b: BusLineData) => a.id - b.id,
        );
      } catch (e) {
        console.error('Error parsing localStorage data:', e);
        this.lines = [];
      }
    }
  }

  refresh(): void {
    this.loadLinesFromLocalStorage();
  }

  openEditModal(line: BusLineData): void {
    this.editingLine = line;
    this.formName = line.name || '';
    this.clearErrors();
    this.isModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
    this.editingLine = null;
    this.clearErrors();
  }

  clearErrors(): void {
    this.nameError = '';
  }

  validateForm(): boolean {
    this.clearErrors();
    let isValid = true;

    // Walidacja nazwy (min 3 znaki)
    if (this.formName.trim().length < 3) {
      this.nameError = 'Nazwa musi zawierać co najmniej 3 znaki';
      isValid = false;
    }

    return isValid;
  }

  saveLine(): void {
    if (!this.validateForm() || !this.editingLine) {
      return;
    }

    // Aktualizuj dane linii
    this.editingLine.name = this.formName.trim();

    // Zapisz do localStorage
    this.saveToLocalStorage();

    // Odśwież tabelę
    this.loadLinesFromLocalStorage();

    // Zamknij modal
    this.closeModal();
  }

  saveToLocalStorage(): void {
    const data = localStorage.getItem('smart-transport-data');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        parsed.routes = this.lines;
        localStorage.setItem('smart-transport-data', JSON.stringify(parsed));
      } catch (e) {
        console.error('Error saving to localStorage:', e);
      }
    }
  }

  /**
   * Calculate the length of a bus line in meters based on its GPS points
   * Uses the Haversine formula to calculate distance between consecutive points
   */
  getLineLength(line: BusLineData): number {
    if (!line.points || line.points.length < 2) {
      return 0;
    }

    let totalDistance = 0;

    for (let i = 0; i < line.points.length - 1; i++) {
      const point1 = line.points[i];
      const point2 = line.points[i + 1];
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
   * Navigate to the line details page
   */
  viewLineDetails(): void {
    if (this.editingLine) {
      this.router.navigate(['/bus-lines', this.editingLine.id]);
      this.closeModal();
    }
  }

  /**
   * Delete the current line after confirmation
   * Also removes all dependencies in bus stops and areas
   */
  deleteLine(): void {
    if (!this.editingLine) {
      return;
    }

    const lineName = this.editingLine.name;
    const lineId = this.editingLine.id;

    // Show confirmation dialog
    const confirmed = confirm(
      `Czy na pewno chcesz usunąć linię "${lineName}"?\n\n` +
        `Zostaną usunięte również wszystkie powiązania tej linii z przystankami i obszarami.\n\n` +
        `Tej operacji nie można cofnąć.`,
    );

    if (!confirmed) {
      return;
    }

    // Get data from localStorage
    const data = localStorage.getItem('smart-transport-data');
    if (!data) {
      return;
    }

    try {
      const parsed = JSON.parse(data);

      // 1. Remove the line from routes array
      parsed.routes = (parsed.routes || []).filter(
        (route: BusLineData) => route.id !== lineId,
      );

      // 2. Update bus stops - remove line references
      if (parsed.stops && Array.isArray(parsed.stops)) {
        parsed.stops = parsed.stops.map((stop: any) => {
          // Remove from busLines array
          if (Array.isArray(stop.busLines)) {
            stop.busLines = stop.busLines.filter((id: number) => id !== lineId);
          }

          // Remove from connectedRouteIds (convert Set to array and back)
          if (stop.connectedRouteIds) {
            const routeIds = Array.isArray(stop.connectedRouteIds)
              ? stop.connectedRouteIds
              : Array.from(stop.connectedRouteIds);
            stop.connectedRouteIds = routeIds.filter(
              (id: number) => id !== lineId,
            );
          }

          return stop;
        });
      }

      // 3. Update areas - remove line references from servingLines
      if (parsed.areas && Array.isArray(parsed.areas)) {
        parsed.areas = parsed.areas.map((area: any) => {
          if (Array.isArray(area.servingLines)) {
            // servingLines appears to store line IDs as strings
            area.servingLines = area.servingLines.filter(
              (id: string) => id !== String(lineId) && id !== lineId.toString(),
            );
          }
          return area;
        });
      }

      // Save updated data back to localStorage
      localStorage.setItem('smart-transport-data', JSON.stringify(parsed));

      // Update local state
      this.lines = parsed.routes;

      // Close modal and refresh
      this.closeModal();
      this.loadLinesFromLocalStorage();

      // Show success message
      alert(`Linia "${lineName}" została pomyślnie usunięta.`);
    } catch (e) {
      console.error('Error deleting line:', e);
      alert('Wystąpił błąd podczas usuwania linii.');
    }
  }
}
