import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface AreaData {
  id: string;
  name: string | null;
  areaM2: number;
  population: number;
  highPercentageOfElderly: boolean;
  servingLines: string[];
  populationDensity: number;
  publicTransportUsagePercent: number;
  latlngs?: any[];
}

@Component({
  selector: 'app-areas-and-goals-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './areas-and-goals-page.component.html',
  styleUrls: ['./areas-and-goals-page.component.css'],
})
export class AreasAndGoalsPageComponent implements OnInit {
  areas: AreaData[] = [];
  isModalOpen = false;
  editingArea: AreaData | null = null;

  // Form fields
  formName: string = '';
  formPopulation: number = 0;
  formHighPercentageOfElderly: boolean = false;
  formPublicTransportUsagePercent: number = 5;

  // Validation
  nameError: string = '';
  populationError: string = '';
  usageError: string = '';

  ngOnInit(): void {
    this.loadAreasFromLocalStorage();
  }

  loadAreasFromLocalStorage(): void {
    const data = localStorage.getItem('smart-transport-data');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        this.areas = parsed.areas || [];
      } catch (e) {
        console.error('Error parsing localStorage data:', e);
        this.areas = [];
      }
    }
  }

  refresh(): void {
    this.loadAreasFromLocalStorage();
  }

  openEditModal(area: AreaData): void {
    this.editingArea = area;
    this.formName = area.name || '';
    this.formPopulation = area.population;
    this.formHighPercentageOfElderly = area.highPercentageOfElderly;
    this.formPublicTransportUsagePercent = area.publicTransportUsagePercent;
    this.clearErrors();
    this.isModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
    this.editingArea = null;
    this.clearErrors();
  }

  clearErrors(): void {
    this.nameError = '';
    this.populationError = '';
    this.usageError = '';
  }

  validateForm(): boolean {
    this.clearErrors();
    let isValid = true;

    // Walidacja nazwy (min 3 znaki)
    if (this.formName.trim().length < 3) {
      this.nameError = 'Nazwa musi zawierać co najmniej 3 znaki';
      isValid = false;
    }

    // Walidacja zaludnienia (0-10000)
    if (this.formPopulation < 0 || this.formPopulation > 10000) {
      this.populationError = 'Zaludnienie musi być w zakresie 0-10000';
      isValid = false;
    }

    // Walidacja % korzystających (0-100)
    if (
      this.formPublicTransportUsagePercent < 0 ||
      this.formPublicTransportUsagePercent > 100
    ) {
      this.usageError = 'Procent musi być w zakresie 0-100';
      isValid = false;
    }

    return isValid;
  }

  saveArea(): void {
    if (!this.validateForm() || !this.editingArea) {
      return;
    }

    // Aktualizuj dane obszaru
    this.editingArea.name = this.formName.trim();
    this.editingArea.population = this.formPopulation;
    this.editingArea.highPercentageOfElderly = this.formHighPercentageOfElderly;
    this.editingArea.publicTransportUsagePercent =
      this.formPublicTransportUsagePercent;

    // Oblicz gęstość zaludnienia
    if (this.editingArea.areaM2 > 0) {
      this.editingArea.populationDensity =
        Math.round(
          (this.editingArea.population / this.editingArea.areaM2) * 1000000,
        ) / 1000000;
    } else {
      this.editingArea.populationDensity = 0;
    }

    // Zapisz do localStorage
    this.saveToLocalStorage();

    // Odśwież tabelę
    this.loadAreasFromLocalStorage();

    // Zamknij modal
    this.closeModal();
  }

  saveToLocalStorage(): void {
    const data = localStorage.getItem('smart-transport-data');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        parsed.areas = this.areas;
        localStorage.setItem('smart-transport-data', JSON.stringify(parsed));
      } catch (e) {
        console.error('Error saving to localStorage:', e);
      }
    }
  }
}
