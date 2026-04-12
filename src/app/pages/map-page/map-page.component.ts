import {
  Component,
  AfterViewInit,
  ViewChild,
  ElementRef,
  HostListener,
} from '@angular/core';
import { MapService } from '../../services/map.service';
import { AppMode, DrawType } from '../../models';

@Component({
  selector: 'app-map-page',
  standalone: true,
  templateUrl: './map-page.component.html',
  styleUrls: ['./map-page.component.css'],
})
export class MapPageComponent implements AfterViewInit {
  @ViewChild('mapContainer', { static: true }) mapRef!: ElementRef;

  mode: AppMode = 'view';
  drawType: DrawType = 'stop';

  constructor(public mapService: MapService) {}

  ngAfterViewInit(): void {
    this.mapService.initMap(this.mapRef.nativeElement);
  }

  setMode(m: AppMode): void {
    this.mode = m;
    this.mapService.setMode(m);
  }

  setDrawType(t: DrawType): void {
    this.drawType = t;
    this.mapService.setDrawType(t);
  }

  save(): void {
    this.mapService.saveToLocalStorage();
    alert('Dane zostały zapisane pomyślnie!');
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.mapService.hasUnsavedChanges) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  canDeactivate(): boolean {
    if (this.mapService.hasUnsavedChanges) {
      return confirm(
        'Masz niezapisane zmiany. Czy na pewno chcesz opuścić stronę?',
      );
    }
    return true;
  }

  clear(): void {
    if (confirm('Czy na pewno chcesz wyczysc' + 'ic mape?')) {
      this.mapService.clearAll();
    }
  }

  get stopCount(): number {
    let count = 0;
    this.mapService.stops.forEach((s) => { if (!s.busLoop) count++; });
    return count;
  }
  get busLoopCount(): number {
    let count = 0;
    this.mapService.stops.forEach((s) => { if (s.busLoop) count++; });
    return count;
  }
  get routeCount(): number {
    return this.mapService.routes.size;
  }
  get areaCount(): number {
    return this.mapService.areas.size;
  }
  get destinationCount(): number {
    return this.mapService.destinations.size;
  }
}
