import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface DestinationData {
  id: number;
  name: string;
  lat: number;
  lng: number;
  recommendedLowFloor?: boolean;
}

interface StopData {
  id: number;
  name: string;
  busLines: string[];
  nearbyDestinationIds: number[];
}

interface RouteData {
  id: number;
  name: string;
}

@Component({
  selector: 'app-destinations-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './destinations-page.component.html',
  styleUrls: ['./destinations-page.component.css'],
})
export class DestinationsPageComponent implements OnInit {
  destinations: DestinationData[] = [];
  stops: StopData[] = [];
  routes: RouteData[] = [];
  isModalOpen = false;
  editingDestination: DestinationData | null = null;

  // Form fields
  formName: string = '';
  formRecommendedLowFloor: boolean = false;

  // Validation
  nameError: string = '';

  ngOnInit(): void {
    this.loadDestinationsFromLocalStorage();
  }

  loadDestinationsFromLocalStorage(): void {
    const data = localStorage.getItem('smart-transport-data');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        this.destinations = (parsed.destinations || [])
          .map((dest: DestinationData) => ({
            ...dest,
            recommendedLowFloor: dest.recommendedLowFloor ?? false,
          }))
          .sort((a: DestinationData, b: DestinationData) => a.id - b.id);
        this.stops = parsed.stops || [];
        this.routes = parsed.routes || [];
      } catch (e) {
        console.error('Error parsing localStorage data:', e);
        this.destinations = [];
        this.stops = [];
        this.routes = [];
      }
    }
  }

  refresh(): void {
    this.loadDestinationsFromLocalStorage();
  }

  openEditModal(destination: DestinationData): void {
    this.editingDestination = destination;
    this.formName = destination.name || '';
    this.formRecommendedLowFloor = destination.recommendedLowFloor ?? false;
    this.clearErrors();
    this.isModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
    this.editingDestination = null;
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

  saveDestination(): void {
    if (!this.validateForm() || !this.editingDestination) {
      return;
    }

    // Aktualizuj dane celu
    this.editingDestination.name = this.formName.trim();
    this.editingDestination.recommendedLowFloor = this.formRecommendedLowFloor;

    // Zapisz do localStorage
    this.saveToLocalStorage();

    // Odśwież tabelę
    this.loadDestinationsFromLocalStorage();

    // Zamknij modal
    this.closeModal();
  }

  saveToLocalStorage(): void {
    const data = localStorage.getItem('smart-transport-data');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        parsed.destinations = this.destinations;
        localStorage.setItem('smart-transport-data', JSON.stringify(parsed));
      } catch (e) {
        console.error('Error saving to localStorage:', e);
      }
    }
  }

  getStopsForDestination(destId: number): StopData[] {
    return this.stops.filter((stop) =>
      stop.nearbyDestinationIds.includes(destId),
    );
  }

  getBusLinesForDestination(destId: number): string[] {
    const stops = this.getStopsForDestination(destId);
    const busLinesSet = new Set<string>();

    stops.forEach((stop) => {
      stop.busLines.forEach((line) => busLinesSet.add(line));
    });

    return Array.from(busLinesSet).sort();
  }
}
