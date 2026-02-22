import { Component, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
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

  clear(): void {
    if (confirm('Czy na pewno chcesz wyczysc' + 'ic mape?')) {
      this.mapService.clearAll();
    }
  }

  get stopCount(): number {
    return this.mapService.stops.size;
  }
  get routeCount(): number {
    return this.mapService.routes.size;
  }
  get areaCount(): number {
    return this.mapService.areas.size;
  }
}
