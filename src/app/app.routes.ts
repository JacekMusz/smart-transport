import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/map', pathMatch: 'full' },
  {
    path: 'map',
    loadComponent: () =>
      import('./pages/map-page/map-page.component').then(
        (m) => m.MapPageComponent,
      ),
  },
  {
    path: 'areas-and-goals',
    loadComponent: () =>
      import('./pages/areas-page/areas-page.component').then(
        (m) => m.AreasPageComponent,
      ),
  },
  {
    path: 'bus-stops',
    loadComponent: () =>
      import('./pages/bus-stops-page/bus-stops-page.component').then(
        (m) => m.BusStopsPageComponent,
      ),
  },
  {
    path: 'vehicles',
    loadComponent: () =>
      import('./pages/vehicles-page/vehicles-page.component').then(
        (m) => m.VehiclesPageComponent,
      ),
  },
  {
    path: 'bus-lines',
    loadComponent: () =>
      import('./pages/bus-lines-page/bus-lines-page.component').then(
        (m) => m.BusLinesPageComponent,
      ),
  },
  {
    path: 'bus-lines/:id',
    loadComponent: () =>
      import('./pages/bus-line-detail-page/bus-line-detail-page.component').then(
        (m) => m.BusLineDetailPageComponent,
      ),
  },
  {
    path: 'bus-lines/:id/charts',
    loadComponent: () =>
      import('./pages/bus-line-charts-page/bus-line-charts-page.component').then(
        (m) => m.BusLineChartsPageComponent,
      ),
  },
  {
    path: 'destinations',
    loadComponent: () =>
      import('./pages/destinations-page/destinations-page.component').then(
        (m) => m.DestinationsPageComponent,
      ),
  },
];
