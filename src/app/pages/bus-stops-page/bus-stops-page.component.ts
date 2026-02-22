import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface BusStopData {
  id: number;
  name: string;
  busLines: number[];
  hasShelter: boolean;
  lat: number;
  lng: number;
  connectedRouteIds: number[];
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
      } catch (e) {
        console.error('Error parsing localStorage data:', e);
        this.stops = [];
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
}
