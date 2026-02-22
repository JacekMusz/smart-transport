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
      import('./pages/areas-and-goals-page/areas-and-goals-page.component').then(
        (m) => m.AreasAndGoalsPageComponent,
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
];
