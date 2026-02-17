import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import 'leaflet-textpath';
import * as turf from '@turf/turf';

import {
  BusStop,
  BusRoute,
  RoutePoint,
  AreaPolygon,
  AppMode,
  DrawType,
} from '../models';

@Injectable({ providedIn: 'root' })
export class MapService {
  /* ───── state ───── */
  map!: L.Map;
  private drawnItems!: L.FeatureGroup;
  private snapTargetGroup!: L.FeatureGroup;

  stops: Map<string, BusStop> = new Map();
  routes: Map<string, BusRoute> = new Map();
  areas: Map<string, AreaPolygon> = new Map();

  mode: AppMode = 'view';
  drawType: DrawType = 'stop';

  private idCounter = 0;
  private nextId(prefix: string): string {
    return `${prefix}_${++this.idCounter}`;
  }

  /* Generate unique color for each route */
  private getRouteColor(index: number): string {
    const colors = [
      '#1565C0', // blue
      '#FFC107', // amber/yellow
      '#4CAF50', // green
      '#FF9800', // orange
      '#9C27B0', // purple
      '#F44336', // red
      '#00BCD4', // cyan
      '#CDDC39', // lime
      '#795548', // brown
      '#607D8B', // blue grey
    ];
    return colors[index % colors.length];
  }

  /* ───── init ───── */
  initMap(element: HTMLElement): void {
    this.map = L.map(element, {
      center: [52.2297, 21.0122],
      zoom: 13,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);

    this.drawnItems = new L.FeatureGroup().addTo(this.map);
    this.snapTargetGroup = new L.FeatureGroup().addTo(this.map);

    /* geoman global options */
    (this.map as any).pm.setGlobalOptions({
      layerGroup: this.drawnItems,
    });

    /* ── event handlers ── */
    this.map.on('pm:create', (e: any) => this.onPmCreate(e));
    this.map.on('pm:remove', (e: any) => this.onPmRemove(e));
    this.map.on('pm:globaleditmodetoggled', (e: any) => {
      if (!e.enabled) {
        this.rebuildAllRoutePoints();
      }
    });

    /* ESC → cancel drawing */
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        (this.map as any).pm.disableDraw();
      }
    });
  }

  /* ═══════════════════════════════════════════
     MODE SWITCHING
     ═══════════════════════════════════════════ */
  setMode(mode: AppMode): void {
    this.disableAll();
    this.mode = mode;

    switch (mode) {
      case 'draw':
        this.activateDraw();
        this.hideRouteTexts();
        break;
      case 'edit-stop':
        this.activateEditStop();
        this.hideRouteTexts();
        break;
      case 'edit-route':
        this.activateEditRoute();
        this.hideRouteTexts();
        break;
      case 'edit-area':
        this.activateEditArea();
        this.hideRouteTexts();
        break;
      case 'delete':
        this.activateDelete();
        this.hideRouteTexts();
        break;
      case 'view':
      default:
        this.activateView();
        this.showRouteTexts();
        break;
    }
  }

  setDrawType(type: DrawType): void {
    this.drawType = type;
    if (this.mode === 'draw') {
      (this.map as any).pm.disableDraw();
      this.activateDraw();
    }
  }

  /* ═══════════════════════════════════════════
     DRAW
     ═══════════════════════════════════════════ */
  private activateDraw(): void {
    switch (this.drawType) {
      case 'stop':
        (this.map as any).pm.enableDraw('Marker', {
          snappable: false,
          markerStyle: {
            icon: this.stopIcon('free'),
          },
        });
        break;
      case 'route':
        this.setStopMarkersPointerEvents(false);
        (this.map as any).pm.enableDraw('Line', {
          snappable: true,
          snapDistance: 25,
          snapLayerGroup: this.snapTargetGroup,
        });
        break;
      case 'area':
        (this.map as any).pm.enableDraw('Polygon', {
          snappable: false,
        });
        break;
    }
  }

  /* ═══════════════════════════════════════════
     EDIT
     ═══════════════════════════════════════════ */
  private activateEditStop(): void {
    /* enable dragging on stop markers & track move */
    this.stops.forEach((stop) => {
      stop.marker.dragging?.enable();
      stop.marker.off('dragend');
      stop.marker.on('dragend', () => this.onStopDragged(stop));
    });
  }

  private activateEditRoute(): void {
    /* enable edit mode only for routes */
    this.routes.forEach((route) => {
      (route.polyline as any).pm.enable({
        snappable: true,
        snapDistance: 25,
      });
    });
  }

  private activateEditArea(): void {
    /* enable edit mode only for areas */
    this.areas.forEach((area) => {
      (area.polygon as any).pm.enable({
        snappable: false,
      });
    });
  }

  /* ═══════════════════════════════════════════
     DELETE
     ═══════════════════════════════════════════ */
  private activateDelete(): void {
    (this.map as any).pm.enableGlobalRemovalMode();
  }

  /* ═══════════════════════════════════════════
     VIEW
     ═══════════════════════════════════════════ */
  private activateView(): void {
    this.stops.forEach((s) => s.marker.dragging?.disable());
  }

  /* ═══════════════════════════════════════════
     ROUTE TEXT VISIBILITY
     ═══════════════════════════════════════════ */
  private showRouteTexts(): void {
    this.routes.forEach((route) => {
      const routeIndex = Array.from(this.routes.keys()).indexOf(route.id);
      const color = this.getRouteColor(routeIndex);
      (route.polyline as any).setText(route.name, {
        repeat: 250,
        offset: 8,
        attributes: {
          fill: color,
          'font-size': '14',
          'font-weight': 'bold',
          'text-anchor': 'middle',
        },
      });
    });
  }

  private hideRouteTexts(): void {
    this.routes.forEach((route) => {
      (route.polyline as any).setText(null);
    });
  }

  /* ═══════════════════════════════════════════
     DISABLE ALL
     ═══════════════════════════════════════════ */
  private disableAll(): void {
    (this.map as any).pm.disableDraw();
    (this.map as any).pm.disableGlobalEditMode();
    (this.map as any).pm.disableGlobalRemovalMode();
    this.setStopMarkersPointerEvents(true);

    /* disable stop dragging */
    this.stops.forEach((s) => s.marker.dragging?.disable());

    /* disable route editing */
    this.routes.forEach((r) => {
      if ((r.polyline as any).pm?.enabled()) {
        (r.polyline as any).pm.disable();
      }
    });

    /* disable area editing */
    this.areas.forEach((a) => {
      if ((a.polygon as any).pm?.enabled()) {
        (a.polygon as any).pm.disable();
      }
    });
  }

  /* ═══════════════════════════════════════════
     PM:CREATE handler
     ═══════════════════════════════════════════ */
  private onPmCreate(e: any): void {
    const layer = e.layer;

    if (e.shape === 'Marker') {
      this.createStop(layer);
    } else if (e.shape === 'Line') {
      this.createRoute(layer);
      this.setStopMarkersPointerEvents(true);
    } else if (e.shape === 'Polygon') {
      this.createArea(layer);
    }

    /* re-enable draw mode after a short delay */
    if (this.mode === 'draw') {
      (this.map as any).pm.disableDraw();
      setTimeout(() => this.activateDraw(), 100);
    }
  }

  /* ═══════════════════════════════════════════
     PM:REMOVE handler
     ═══════════════════════════════════════════ */
  private onPmRemove(e: any): void {
    const layer = e.layer;

    /* find & remove stop */
    for (const [id, stop] of this.stops) {
      if (stop.marker === layer) {
        this.removeStop(id);
        return;
      }
    }
    /* find & remove route */
    for (const [id, route] of this.routes) {
      if (route.polyline === layer) {
        this.removeRoute(id);
        return;
      }
    }
    /* find & remove area */
    for (const [id, area] of this.areas) {
      if (area.polygon === layer) {
        this.areas.delete(id);
        return;
      }
    }
  }

  /* ═══════════════════════════════════════════
     STOP helpers
     ═══════════════════════════════════════════ */
  private createStop(marker: L.Marker): void {
    const id = this.nextId('stop');
    const stop: BusStop = {
      id,
      name: `Przystanek ${id}`,
      latLng: marker.getLatLng(),
      marker,
      connectedRouteIds: new Set(),
    };

    marker.setIcon(this.stopIcon('free'));
    marker.bindTooltip(stop.name);

    this.stops.set(id, stop);
    this.snapTargetGroup.addLayer(marker);

    /* re-check proximity for all routes */
    this.refreshAllStopIcons();
  }

  private removeStop(id: string): void {
    const stop = this.stops.get(id);
    if (!stop) return;

    /* remove from snap group */
    this.snapTargetGroup.removeLayer(stop.marker);

    /* clear stop references from all routes */
    this.routes.forEach((route) => {
      route.points.forEach((pt) => {
        if (pt.stopId === id) pt.stopId = null;
      });
    });

    this.stops.delete(id);
    this.refreshAllStopIcons();
  }

  /* ═══════════════════════════════════════════
     ROUTE helpers
     ═══════════════════════════════════════════ */
  private createRoute(polyline: L.Polyline): void {
    const id = this.nextId('route');
    const latlngs = polyline.getLatLngs() as L.LatLng[];
    const routeIndex = this.routes.size;
    const color = this.getRouteColor(routeIndex);

    polyline.setStyle({
      color: color,
      weight: 4,
      opacity: 0.8,
    });

    const points = this.buildRoutePoints(latlngs, id);

    const route: BusRoute = { id, name: `Trasa ${id}`, points, polyline };
    this.routes.set(id, route);

    /* Add text along the path initially hidden */
    if (this.mode === 'view') {
      this.showRouteTexts();
    }

    polyline.bindTooltip(route.name);

    /* listen for edit end to rebuild points and update text */
    polyline.on('pm:edit', () => {
      const newLL = polyline.getLatLngs() as L.LatLng[];
      route.points = this.buildRoutePoints(newLL, id);

      /* Update text path after edit if in view mode */
      if (this.mode === 'view') {
        this.showRouteTexts();
      }

      this.refreshAllStopIcons();
    });

    this.refreshAllStopIcons();
  }

  private removeRoute(id: string): void {
    const route = this.routes.get(id);
    if (!route) return;

    /* clear connected-route from stops */
    this.stops.forEach((stop) => stop.connectedRouteIds.delete(id));
    this.routes.delete(id);
    this.refreshAllStopIcons();
  }

  /** Build RoutePoint[], snap to nearby stops */
  private buildRoutePoints(latlngs: L.LatLng[], routeId: string): RoutePoint[] {
    /* first clear previous connections for this route */
    this.stops.forEach((stop) => stop.connectedRouteIds.delete(routeId));

    const points: RoutePoint[] = latlngs.map((ll) => {
      const nearest = this.findNearestStop(ll, 25);
      if (nearest) {
        nearest.connectedRouteIds.add(routeId);
        return { latLng: nearest.latLng, stopId: nearest.id };
      }
      return { latLng: ll, stopId: null };
    });
    return points;
  }

  private rebuildAllRoutePoints(): void {
    this.routes.forEach((route) => {
      const latlngs = route.polyline.getLatLngs() as L.LatLng[];
      route.points = this.buildRoutePoints(latlngs, route.id);
    });
    this.refreshAllStopIcons();
  }

  /* ═══════════════════════════════════════════
     AREA helpers
     ═══════════════════════════════════════════ */
  private createArea(polygon: L.Polygon): void {
    const id = this.nextId('area');

    polygon.setStyle({
      color: '#E91E63',
      weight: 3,
      fillOpacity: 0.2,
    });

    const areaM2 = this.calcArea(polygon);
    const area: AreaPolygon = { id, polygon, areaM2 };
    this.areas.set(id, area);

    this.bindAreaPopup(area);

    polygon.on('pm:edit', () => {
      area.areaM2 = this.calcArea(polygon);
      this.bindAreaPopup(area);
    });
  }

  private calcArea(polygon: L.Polygon): number {
    const latlngs = (polygon.getLatLngs() as L.LatLng[][])[0];
    const coords = latlngs.map((ll) => [ll.lng, ll.lat]);
    coords.push(coords[0]); // close ring
    const turfPoly = turf.polygon([coords]);
    return turf.area(turfPoly);
  }

  private bindAreaPopup(area: AreaPolygon): void {
    const m2 = area.areaM2.toFixed(2);
    const km2 = (area.areaM2 / 1_000_000).toFixed(6);
    area.polygon.bindPopup(
      `<strong>Obszar ${area.id}</strong><br>` +
        `Powierzchnia: ${m2} m²<br>` +
        `Powierzchnia: ${km2} km²`,
    );
  }

  /* ═══════════════════════════════════════════
     STOP DRAG
     ═══════════════════════════════════════════ */
  private onStopDragged(stop: BusStop): void {
    stop.latLng = stop.marker.getLatLng();

    /* update every connected route's polyline */
    stop.connectedRouteIds.forEach((routeId) => {
      const route = this.routes.get(routeId);
      if (!route) return;

      route.points.forEach((pt) => {
        if (pt.stopId === stop.id) {
          pt.latLng = stop.latLng;
        }
      });

      const newLL = route.points.map((p) => p.latLng);
      route.polyline.setLatLngs(newLL);

      /* rebuild edit handles if in edit mode */
      if ((route.polyline as any).pm?.enabled()) {
        (route.polyline as any).pm.disable();
        (route.polyline as any).pm.enable();
      }
    });
  }

  /* ═══════════════════════════════════════════
     ICON helpers
     ═══════════════════════════════════════════ */
  stopIcon(state: 'free' | 'vertex' | 'nearby'): L.DivIcon {
    let bg: string;
    let size: number;
    let emoji = '';

    switch (state) {
      case 'vertex':
        bg = '#4CAF50';
        size = 36;
        emoji = '🚌';
        break;
      case 'nearby':
        bg = '#FF9800';
        size = 27;
        emoji = '🚌';
        break;
      case 'free':
      default:
        bg = '#2196F3';
        size = 27;
        break;
    }

    return L.divIcon({
      className: 'bus-stop-icon',
      html: `<div style="
        width:${size}px;height:${size}px;
        border-radius:50%;
        background:${bg};
        display:flex;align-items:center;justify-content:center;
        color:#fff;font-size:${size * 0.45}px;
        border:2px solid #fff;
        box-shadow:0 2px 6px rgba(0,0,0,.35);
      ">${emoji}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  /** Refresh every stop icon based on route connections + proximity */
  refreshAllStopIcons(): void {
    this.stops.forEach((stop) => {
      if (stop.connectedRouteIds.size > 0) {
        stop.marker.setIcon(this.stopIcon('vertex'));
      } else if (this.isNearAnyRoute(stop, 30)) {
        stop.marker.setIcon(this.stopIcon('nearby'));
      } else {
        stop.marker.setIcon(this.stopIcon('free'));
      }
    });
  }

  /* ═══════════════════════════════════════════
     GEOMETRY helpers
     ═══════════════════════════════════════════ */
  private findNearestStop(ll: L.LatLng, maxMeters: number): BusStop | null {
    let best: BusStop | null = null;
    let bestDist = Infinity;
    this.stops.forEach((stop) => {
      const d = this.map.distance(ll, stop.latLng);
      if (d < maxMeters && d < bestDist) {
        best = stop;
        bestDist = d;
      }
    });
    return best;
  }

  private isNearAnyRoute(stop: BusStop, maxMeters: number): boolean {
    const pt = turf.point([stop.latLng.lng, stop.latLng.lat]);
    for (const route of this.routes.values()) {
      const coords = (route.polyline.getLatLngs() as L.LatLng[]).map((ll) => [
        ll.lng,
        ll.lat,
      ]);
      if (coords.length < 2) continue;
      const line = turf.lineString(coords);
      const dist = turf.pointToLineDistance(pt, line, { units: 'meters' });
      if (dist < maxMeters) return true;
    }
    return false;
  }

  private setStopMarkersPointerEvents(enabled: boolean): void {
    this.stops.forEach((stop) => {
      const el = (stop.marker as any)._icon as HTMLElement | undefined;
      if (el) {
        el.style.pointerEvents = enabled ? 'auto' : 'none';
      }
    });
  }

  /* ═══════════════════════════════════════════
     SAVE / CLEAR
     ═══════════════════════════════════════════ */
  exportData(): object {
    const stopsArr = Array.from(this.stops.values()).map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.latLng.lat,
      lng: s.latLng.lng,
      connectedRouteIds: [...s.connectedRouteIds],
    }));
    const routesArr = Array.from(this.routes.values()).map((r) => ({
      id: r.id,
      name: r.name,
      points: r.points.map((p) => ({
        lat: p.latLng.lat,
        lng: p.latLng.lng,
        stopId: p.stopId,
      })),
    }));
    const areasArr = Array.from(this.areas.values()).map((a) => ({
      id: a.id,
      areaM2: a.areaM2,
      latlngs: (a.polygon.getLatLngs() as L.LatLng[][]).map((ring) =>
        ring.map((ll) => ({ lat: ll.lat, lng: ll.lng })),
      ),
    }));
    return { stops: stopsArr, routes: routesArr, areas: areasArr };
  }

  clearAll(): void {
    this.disableAll();
    this.drawnItems.clearLayers();
    this.snapTargetGroup.clearLayers();
    this.stops.clear();
    this.routes.clear();
    this.areas.clear();
  }
}
