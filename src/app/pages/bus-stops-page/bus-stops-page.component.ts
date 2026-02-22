import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface StopAreaService {
  areaId: string;
  coverage: number;
  populationServed: number;
}

interface BusStopData {
  id: number;
  name: string;
  busLines: number[];
  hasShelter: boolean;
  lat: number;
  lng: number;
  connectedRouteIds: number[];
  areas: StopAreaService[];
  nearbyDestinationIds?: number[];
}

interface DestinationData {
  id: number;
  name: string;
}

@Component({
  selector: 'app-bus-stops-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bus-stops-page.component.html',
  styleUrls: ['./bus-stops-page.component.css'],
})
export class BusStopsPageComponent implements OnInit {
  stops: BusStopData[] = [];
  destinations: DestinationData[] = [];
  isModalOpen = false;
  editingStop: BusStopData | null = null;

  // Form fields
  formName: string = '';
  formHasShelter: boolean = false;

  // Validation
  nameError: string = '';

  ngOnInit(): void {
    this.loadStopsFromLocalStorage();
  }

  loadStopsFromLocalStorage(): void {
    const data = localStorage.getItem('smart-transport-data');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        this.stops = (parsed.stops || []).sort(
          (a: BusStopData, b: BusStopData) => a.id - b.id,
        );
        this.destinations = parsed.destinations || [];
      } catch (e) {
        console.error('Error parsing localStorage data:', e);
        this.stops = [];
        this.destinations = [];
      }
    }
  }

  refresh(): void {
    this.loadStopsFromLocalStorage();
  }

  openEditModal(stop: BusStopData): void {
    this.editingStop = stop;
    this.formName = stop.name || '';
    this.formHasShelter = stop.hasShelter;
    this.clearErrors();
    this.isModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
    this.editingStop = null;
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

  saveStop(): void {
    if (!this.validateForm() || !this.editingStop) {
      return;
    }

    // Aktualizuj dane przystanku
    this.editingStop.name = this.formName.trim();
    this.editingStop.hasShelter = this.formHasShelter;

    // Zapisz do localStorage
    this.saveToLocalStorage();

    // Odśwież tabelę
    this.loadStopsFromLocalStorage();

    // Zamknij modal
    this.closeModal();
  }

  saveToLocalStorage(): void {
    const data = localStorage.getItem('smart-transport-data');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        parsed.stops = this.stops;
        localStorage.setItem('smart-transport-data', JSON.stringify(parsed));
      } catch (e) {
        console.error('Error saving to localStorage:', e);
      }
    }
  }

  getTotalPopulation(stop: BusStopData): number {
    if (!stop.areas || stop.areas.length === 0) {
      return 0;
    }
    return stop.areas.reduce((sum, area) => sum + area.populationServed, 0);
  }

  getDestinationNames(stop: BusStopData): string {
    if (!stop.nearbyDestinationIds || stop.nearbyDestinationIds.length === 0) {
      return 'Brak';
    }
    const names = stop.nearbyDestinationIds
      .map((id) => {
        const dest = this.destinations.find((d) => d.id === id);
        return dest ? dest.name : `Cel ${id}`;
      })
      .join(', ');
    return names || 'Brak';
  }
}
