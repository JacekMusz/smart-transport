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
  TravelDestination,
} from '../models';

@Injectable({ providedIn: 'root' })
export class MapService {
  /* ───── state ───── */
  map!: L.Map;
  private drawnItems!: L.FeatureGroup;
  private snapTargetGroup!: L.FeatureGroup;

  stops: Map<number, BusStop> = new Map();
  routes: Map<number, BusRoute> = new Map();
  areas: Map<string, AreaPolygon> = new Map();
  destinations: Map<number, TravelDestination> = new Map();

  mode: AppMode = 'view';
  drawType: DrawType = 'stop';

  private stopIdCounter = 0;
  private routeIdCounter = 0;
  private idCounter = 0;
  private destinationIdCounter = 0;

  private nextStopId(): number {
    return ++this.stopIdCounter;
  }

  private nextRouteId(): number {
    return ++this.routeIdCounter;
  }

  private nextDestinationId(): number {
    return ++this.destinationIdCounter;
  }

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

    /* Update area labels on zoom to adjust size */
    this.map.on('zoomend', () => {
      this.refreshAllAreaPopups();
    });

    /* ESC → cancel drawing */
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        (this.map as any).pm.disableDraw();
      }
    });

    /* Load data from localStorage */
    this.loadFromLocalStorage();
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
        this.hideStopCircles();
        this.hideAreaLabels();
        break;
      case 'edit-stop':
        this.activateEditStop();
        this.hideRouteTexts();
        this.hideStopCircles();
        this.hideAreaLabels();
        break;
      case 'edit-route':
        this.activateEditRoute();
        this.hideRouteTexts();
        this.hideStopCircles();
        this.hideAreaLabels();
        break;
      case 'edit-area':
        this.activateEditArea();
        this.hideRouteTexts();
        this.hideStopCircles();
        this.hideAreaLabels();
        break;
      case 'edit-destination':
        this.activateEditDestination();
        this.hideRouteTexts();
        this.hideStopCircles();
        this.hideAreaLabels();
        break;
      case 'delete':
        this.activateDelete();
        this.hideRouteTexts();
        this.hideStopCircles();
        this.hideAreaLabels();
        break;
      case 'view':
      default:
        this.activateView();
        this.showRouteTexts();
        this.showStopCircles();
        this.showAreaLabels();
        break;
    }

    /* Refresh stop icons to show/hide numbers based on mode */
    this.refreshAllStopIcons();
    this.refreshAllDestinationIcons();
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
          snapSegment: false, // Disable snapping to line segments
          snapMiddle: false, // Disable snapping to middle of segments
          snapVertex: false, // Disable snapping to vertices of other layers
        });
        break;
      case 'area':
        (this.map as any).pm.enableDraw('Polygon', {
          snappable: false,
        });
        break;
      case 'destination':
        (this.map as any).pm.enableDraw('Marker', {
          snappable: false,
          markerStyle: {
            icon: this.destinationIcon(),
          },
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

  private activateEditDestination(): void {
    /* enable dragging on destination markers */
    this.destinations.forEach((dest) => {
      dest.marker.dragging?.enable();
      dest.marker.off('dragend');
      dest.marker.on('dragend', () => this.onDestinationDragged(dest));
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
    this.destinations.forEach((d) => d.marker.dragging?.disable());
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
     STOP CIRCLE VISIBILITY
     ═══════════════════════════════════════════ */
  private showStopCircles(): void {
    this.stops.forEach((stop) => {
      if (stop.circle) {
        stop.circle.addTo(this.map);
      }
    });
  }

  private hideStopCircles(): void {
    this.stops.forEach((stop) => {
      if (stop.circle) {
        stop.circle.remove();
      }
    });
  }

  /* ═══════════════════════════════════════════
     AREA LABEL VISIBILITY
     ═══════════════════════════════════════════ */
  private showAreaLabels(): void {
    this.areas.forEach((area) => {
      const tooltip = area.polygon.getTooltip();
      if (tooltip) {
        area.polygon.openTooltip();
      }
    });
  }

  private hideAreaLabels(): void {
    this.areas.forEach((area) => {
      area.polygon.closeTooltip();
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

    /* disable destination dragging */
    this.destinations.forEach((d) => d.marker.dragging?.disable());

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
      if (this.drawType === 'destination') {
        this.createDestination(layer);
      } else {
        this.createStop(layer);
      }
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
    /* find & remove destination */
    for (const [id, dest] of this.destinations) {
      if (dest.marker === layer) {
        this.removeDestination(id);
        return;
      }
    }
  }

  /* ═══════════════════════════════════════════
     STOP helpers
     ═══════════════════════════════════════════ */
  private createStop(marker: L.Marker): void {
    const id = this.nextStopId();

    /* Create circle around stop */
    const circle = L.circle(marker.getLatLng(), {
      radius: 300,
      color: '#2196F3',
      fillColor: '#2196F3',
      fillOpacity: 0.15,
      opacity: 0.5,
      weight: 2,
    });

    const stop: BusStop = {
      id,
      name: `Przystanek ${id}`,
      busLines: [],
      hasShelter: false,
      latLng: marker.getLatLng(),
      marker,
      circle,
      connectedRouteIds: new Set(),
      areas: [],
      nearbyDestinationIds: [],
    };

    marker.setIcon(this.stopIcon('free', id, false));
    marker.bindTooltip(stop.name);

    this.stops.set(id, stop);
    this.snapTargetGroup.addLayer(marker);

    /* Add circle to map only if in view mode */
    if (this.mode === 'view') {
      circle.addTo(this.map);
    }

    /* re-check proximity for all routes */
    this.refreshAllStopIcons();
    /* update area coverage */
    this.refreshAllAreaPopups();
    /* update stop area service info */
    this.updateStopAreaInfo(stop);
    /* update destination relationships */
    this.updateAllDestinationRelationships();
  }

  private removeStop(id: number): void {
    const stop = this.stops.get(id);
    if (!stop) return;

    /* remove from snap group */
    this.snapTargetGroup.removeLayer(stop.marker);

    /* remove circle */
    if (stop.circle) {
      stop.circle.remove();
    }

    /* clear stop references from all routes */
    this.routes.forEach((route) => {
      route.points.forEach((pt) => {
        if (pt.stopId === id) pt.stopId = null;
      });
    });

    this.stops.delete(id);
    this.refreshAllStopIcons();
    /* update area coverage */
    this.refreshAllAreaPopups();
    /* update destination relationships */
    this.updateAllDestinationRelationships();
  }

  /* ═══════════════════════════════════════════
     DESTINATION helpers
     ═══════════════════════════════════════════ */
  private createDestination(marker: L.Marker): void {
    const id = this.nextDestinationId();

    const destination: TravelDestination = {
      id,
      name: `Cel ${id}`,
      latLng: marker.getLatLng(),
      marker,
    };

    marker.setIcon(this.destinationIcon(id));
    marker.bindTooltip(destination.name);

    this.destinations.set(id, destination);
    this.drawnItems.addLayer(marker);

    /* update destination relationships */
    this.updateAllDestinationRelationships();
  }

  private removeDestination(id: number): void {
    const dest = this.destinations.get(id);
    if (!dest) return;

    this.destinations.delete(id);

    /* update destination relationships */
    this.updateAllDestinationRelationships();
  }

  private onDestinationDragged(dest: TravelDestination): void {
    dest.latLng = dest.marker.getLatLng();

    /* update destination relationships */
    this.updateAllDestinationRelationships();
  }

  /* ═══════════════════════════════════════════
     ROUTE helpers
     ═══════════════════════════════════════════ */
  private createRoute(polyline: L.Polyline): void {
    const id = this.nextRouteId();
    const latlngs = polyline.getLatLngs() as L.LatLng[];
    const routeIndex = this.routes.size;
    const color = this.getRouteColor(routeIndex);

    polyline.setStyle({
      color: color,
      weight: 4,
      opacity: 0.8,
    });

    const points = this.buildRoutePoints(latlngs, id);
    const stopIds = points
      .filter((p) => p.stopId !== null)
      .map((p) => p.stopId!);

    const route: BusRoute = {
      id,
      name: `Linia ${id}`,
      stopIds,
      points,
      polyline,
    };
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
      route.stopIds = route.points
        .filter((p) => p.stopId !== null)
        .map((p) => p.stopId!);

      /* Update text path after edit if in view mode */
      if (this.mode === 'view') {
        this.showRouteTexts();
      }

      this.refreshAllStopIcons();
    });

    this.refreshAllStopIcons();
  }

  private removeRoute(id: number): void {
    const route = this.routes.get(id);
    if (!route) return;

    /* clear connected-route from stops */
    this.stops.forEach((stop) => stop.connectedRouteIds.delete(id));
    this.routes.delete(id);
    this.refreshAllStopIcons();
  }

  /** Build RoutePoint[], snap to nearby stops */
  private buildRoutePoints(latlngs: L.LatLng[], routeId: number): RoutePoint[] {
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
      route.stopIds = route.points
        .filter((p) => p.stopId !== null)
        .map((p) => p.stopId!);
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
    const area: AreaPolygon = {
      id,
      name: null,
      polygon,
      areaM2,
      population: 0,
      highPercentageOfElderly: false,
      servingLines: [],
      populationDensity: 0,
      publicTransportUsagePercent: 5,
      destinationIds: [],
    };
    this.areas.set(id, area);

    this.bindAreaPopup(area);

    // Show tooltip only if in view mode
    if (this.mode === 'view') {
      polygon.openTooltip();
    }

    polygon.on('pm:edit', () => {
      area.areaM2 = this.calcArea(polygon);
      area.populationDensity = this.calculatePopulationDensity(
        area.population,
        area.areaM2,
      );
      this.bindAreaPopup(area);
      /* update stop area service info when area changes */
      this.updateAllStopsAreaInfo();
      /* update destination relationships */
      this.updateAllDestinationRelationships();
    });

    /* update stop area service info for new area */
    this.updateAllStopsAreaInfo();
    /* update destination relationships */
    this.updateAllDestinationRelationships();
  }

  private calculatePopulationDensity(
    population: number,
    areaM2: number,
  ): number {
    if (areaM2 === 0) return 0;
    return Math.round((population / areaM2) * 1000000) / 1000000; // Round to 6 decimal places
  }

  private calcArea(polygon: L.Polygon): number {
    const latlngs = (polygon.getLatLngs() as L.LatLng[][])[0];
    const coords = latlngs.map((ll) => [ll.lng, ll.lat]);
    coords.push(coords[0]); // close ring
    const turfPoly = turf.polygon([coords]);
    return turf.area(turfPoly);
  }

  private bindAreaPopup(area: AreaPolygon): void {
    // Update static content for tooltip
    const km2 = (area.areaM2 / 1_000_000).toFixed(2);
    const coveragePercent = this.calculateAreaCoverage(area);

    const content =
      `<strong>Obszar ${area.id}</strong><br>` +
      `Powierzchnia: ${km2} km²<br>` +
      `Pokrycie: ${coveragePercent.toFixed(1)}%`;

    // Calculate dimensions based on polygon bounds in pixels
    const bounds = area.polygon.getBounds();
    const nw = this.map.latLngToContainerPoint(bounds.getNorthWest());
    const se = this.map.latLngToContainerPoint(bounds.getSouthEast());
    const width = Math.abs(se.x - nw.x);
    const height = Math.abs(se.y - nw.y);
    const minDimension = Math.min(width, height);

    // Set max width to 50% of smallest dimension, capped at 200px
    // If area is too small (< 100px), hide the tooltip
    const maxWidth = Math.min(200, minDimension * 0.5);
    const shouldShow = minDimension > 100;

    // Calculate font size based on area size (7px to 11px)
    const fontSize = Math.max(7, Math.min(11, minDimension / 18));

    // Update or create permanent tooltip
    const existingTooltip = area.polygon.getTooltip();
    if (existingTooltip) {
      existingTooltip.setContent(content);
      // Update tooltip element style
      const tooltipElement = (existingTooltip as any)._container;
      if (tooltipElement) {
        tooltipElement.style.maxWidth = `${maxWidth}px`;
        tooltipElement.style.fontSize = `${fontSize}px`;
        tooltipElement.style.display = shouldShow ? 'block' : 'none';
      }
    } else {
      area.polygon.bindTooltip(content, {
        permanent: true,
        direction: 'center',
        className: 'area-label',
      });
      // Set styles after tooltip is created
      setTimeout(() => {
        const tooltip = area.polygon.getTooltip();
        if (tooltip) {
          const tooltipElement = (tooltip as any)._container;
          if (tooltipElement) {
            tooltipElement.style.maxWidth = `${maxWidth}px`;
            tooltipElement.style.fontSize = `${fontSize}px`;
            tooltipElement.style.display = shouldShow ? 'block' : 'none';
          }
        }
      }, 0);
    }

    // Also bind a popup with dynamic content for click interaction
    area.polygon.unbindPopup();
    area.polygon.bindPopup(() => {
      const m2 = area.areaM2.toFixed(2);
      const km2 = (area.areaM2 / 1_000_000).toFixed(6);
      const coveragePercent = this.calculateAreaCoverage(area);

      return (
        `<strong>Obszar ${area.id}</strong><br>` +
        `Powierzchnia: ${m2} m²<br>` +
        `Powierzchnia: ${km2} km²<br>` +
        `Pokrycie przystankami: ${coveragePercent.toFixed(1)}%`
      );
    });
  }

  /** Calculate what % of area is covered by stop circles (300m radius) */
  private calculateAreaCoverage(area: AreaPolygon): number {
    if (this.stops.size === 0) return 0;

    try {
      const areaCoords = (area.polygon.getLatLngs() as L.LatLng[][])[0];
      const areaGeoJSON = turf.polygon([
        areaCoords
          .map((ll) => [ll.lng, ll.lat])
          .concat([[areaCoords[0].lng, areaCoords[0].lat]]),
      ]);

      // Create circles for all stops and merge them
      let mergedCircles: any = null;

      this.stops.forEach((stop) => {
        const stopCircle = turf.circle(
          [stop.latLng.lng, stop.latLng.lat],
          0.3, // 300m = 0.3km
          { units: 'kilometers', steps: 64 },
        );

        if (mergedCircles === null) {
          mergedCircles = stopCircle;
        } else {
          // Union to avoid double-counting overlapping circles
          const unionResult = turf.union(
            turf.featureCollection([mergedCircles, stopCircle]),
          );
          if (unionResult) {
            mergedCircles = unionResult;
          }
        }
      });

      if (!mergedCircles) return 0;

      // Calculate intersection between merged circles and area
      const intersection = turf.intersect(
        turf.featureCollection([areaGeoJSON, mergedCircles]),
      );

      if (!intersection) return 0;

      const intersectionArea = turf.area(intersection);
      const coverage = (intersectionArea / area.areaM2) * 100;

      return Math.min(coverage, 100); // Cap at 100%
    } catch (error) {
      console.error('Error calculating area coverage:', error);
      return 0;
    }
  }

  /** Refresh popups for all areas (e.g., when stops change) */
  private refreshAllAreaPopups(): void {
    this.areas.forEach((area) => {
      this.bindAreaPopup(area);
    });
  }

  /* ═══════════════════════════════════════════
     STOP AREA SERVICE CALCULATION
     ═══════════════════════════════════════════ */

  /** Calculate coverage of a single area by a single stop's circle */
  private calculateStopAreaCoverage(stop: BusStop, area: AreaPolygon): number {
    if (!stop.circle) return 0;

    try {
      const areaCoords = (area.polygon.getLatLngs() as L.LatLng[][])[0];
      const areaGeoJSON = turf.polygon([
        areaCoords
          .map((ll) => [ll.lng, ll.lat])
          .concat([[areaCoords[0].lng, areaCoords[0].lat]]),
      ]);

      // Create circle for this stop
      const stopCircle = turf.circle(
        [stop.latLng.lng, stop.latLng.lat],
        0.3, // 300m = 0.3km
        { units: 'kilometers', steps: 64 },
      );

      // Calculate intersection between stop circle and area
      const intersection = turf.intersect(
        turf.featureCollection([areaGeoJSON, stopCircle]),
      );

      if (!intersection) return 0;

      const intersectionArea = turf.area(intersection);
      const coverage = (intersectionArea / area.areaM2) * 100;

      return Math.min(coverage, 100); // Cap at 100%
    } catch (error) {
      console.error('Error calculating stop area coverage:', error);
      return 0;
    }
  }

  /** Update area service information for a single stop */
  private updateStopAreaInfo(stop: BusStop): void {
    stop.areas = [];

    this.areas.forEach((area) => {
      const coverage = this.calculateStopAreaCoverage(stop, area);

      // Only include areas with meaningful coverage (>0.1%)
      if (coverage > 0.1) {
        const populationServed = (area.population * coverage) / 100;

        stop.areas.push({
          areaId: area.id,
          coverage: Math.round(coverage * 100) / 100, // Round to 2 decimals
          populationServed: Math.round(populationServed),
        });
      }
    });
  }

  /** Update area service information for all stops */
  private updateAllStopsAreaInfo(): void {
    this.stops.forEach((stop) => {
      this.updateStopAreaInfo(stop);
    });
  }

  /* ═══════════════════════════════════════════
     DESTINATION RELATIONSHIPS
     ═══════════════════════════════════════════ */

  /** Check if a destination is inside an area */
  private isDestinationInArea(
    destination: TravelDestination,
    area: AreaPolygon,
  ): boolean {
    try {
      const point = turf.point([
        destination.latLng.lng,
        destination.latLng.lat,
      ]);
      const areaCoords = (area.polygon.getLatLngs() as L.LatLng[][])[0];
      const areaGeoJSON = turf.polygon([
        areaCoords
          .map((ll) => [ll.lng, ll.lat])
          .concat([[areaCoords[0].lng, areaCoords[0].lat]]),
      ]);
      return turf.booleanPointInPolygon(point, areaGeoJSON);
    } catch (error) {
      console.error('Error checking if destination is in area:', error);
      return false;
    }
  }

  /** Check if a destination is within walking distance of a stop (300m) */
  private isDestinationNearStop(
    destination: TravelDestination,
    stop: BusStop,
  ): boolean {
    const distance = this.map.distance(destination.latLng, stop.latLng);
    return distance <= 300;
  }

  /** Update destination relationships for all areas */
  private updateAllAreaDestinations(): void {
    // Clear all area destination lists
    this.areas.forEach((area) => {
      area.destinationIds = [];
    });

    // Check each destination against each area
    this.destinations.forEach((dest) => {
      this.areas.forEach((area) => {
        if (this.isDestinationInArea(dest, area)) {
          area.destinationIds.push(dest.id);
        }
      });
    });
  }

  /** Update destination relationships for all stops */
  private updateAllStopDestinations(): void {
    // Clear all stop destination lists
    this.stops.forEach((stop) => {
      stop.nearbyDestinationIds = [];
    });

    // Check each destination against each stop
    this.destinations.forEach((dest) => {
      this.stops.forEach((stop) => {
        if (this.isDestinationNearStop(dest, stop)) {
          stop.nearbyDestinationIds.push(dest.id);
        }
      });
    });
  }

  /** Update all destination relationships (areas and stops) */
  private updateAllDestinationRelationships(): void {
    this.updateAllAreaDestinations();
    this.updateAllStopDestinations();
  }

  /* ═══════════════════════════════════════════
     STOP DRAG
     ═══════════════════════════════════════════ */
  private onStopDragged(stop: BusStop): void {
    stop.latLng = stop.marker.getLatLng();

    /* update circle position */
    if (stop.circle) {
      stop.circle.setLatLng(stop.latLng);
    }

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

    /* update area coverage when stop moves */
    this.refreshAllAreaPopups();
    /* update stop area service info */
    this.updateStopAreaInfo(stop);
    /* update destination relationships */
    this.updateAllDestinationRelationships();
  }

  /* ═══════════════════════════════════════════
     ICON helpers
     ═══════════════════════════════════════════ */
  stopIcon(
    state: 'free' | 'vertex' | 'nearby',
    stopId?: number,
    showNumber?: boolean,
  ): L.DivIcon {
    let bg: string;
    let size: number;
    let content = '';

    switch (state) {
      case 'vertex':
        bg = '#4CAF50';
        size = 36;
        break;
      case 'nearby':
        bg = '#FF9800';
        size = 27;
        break;
      case 'free':
      default:
        bg = '#2196F3';
        size = 27;
        break;
    }

    // Show stop number only in view mode
    if (showNumber && stopId !== undefined) {
      content = stopId.toString();
    }

    return L.divIcon({
      className: 'bus-stop-icon',
      html: `<div style="
        width:${size}px;height:${size}px;
        border-radius:50%;
        background:${bg};
        display:flex;align-items:center;justify-content:center;
        color:#fff;font-size:${size * 0.5}px;font-weight:bold;
        border:2px solid #fff;
        box-shadow:0 2px 6px rgba(0,0,0,.35);
      ">${content}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  destinationIcon(destId?: number): L.DivIcon {
    const size = 30;
    const color = '#E91E63'; // Pink color for destinations
    let content = '';

    // Show destination number in view mode
    if (destId !== undefined && this.mode === 'view') {
      content = destId.toString();
    }

    return L.divIcon({
      className: 'destination-icon',
      html: `<div style="
        width:0;height:0;
        border-left:${size / 2}px solid transparent;
        border-right:${size / 2}px solid transparent;
        border-bottom:${size}px solid ${color};
        position:relative;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,.35));
      ">
        <div style="
          position:absolute;
          top:${size * 0.4}px;
          left:${-size / 4}px;
          width:${size / 2}px;
          text-align:center;
          color:#fff;
          font-size:${size * 0.4}px;
          font-weight:bold;
        ">${content}</div>
      </div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
    });
  }

  /* ═══════════════════════════════════════════
     BUS LINES UPDATE
     ═══════════════════════════════════════════ */
  /** Update busLines array for all stops based on their connected routes */
  private updateAllStopBusLines(): void {
    this.stops.forEach((stop) => {
      // Clear existing busLines
      stop.busLines = [];

      // Add route IDs from connectedRouteIds
      stop.connectedRouteIds.forEach((routeId) => {
        const route = this.routes.get(routeId);
        if (route) {
          stop.busLines.push(routeId);
        }
      });

      // Sort busLines for consistent display
      stop.busLines.sort((a, b) => a - b);
    });
  }

  /** Refresh every stop icon based on route connections + proximity */
  refreshAllStopIcons(): void {
    // Update busLines before refreshing icons
    this.updateAllStopBusLines();

    const showNumbers = this.mode === 'view';
    this.stops.forEach((stop) => {
      if (stop.connectedRouteIds.size > 0) {
        stop.marker.setIcon(this.stopIcon('vertex', stop.id, showNumbers));
      } else if (this.isNearAnyRoute(stop, 30)) {
        stop.marker.setIcon(this.stopIcon('nearby', stop.id, showNumbers));
      } else {
        stop.marker.setIcon(this.stopIcon('free', stop.id, showNumbers));
      }
    });
  }

  /** Refresh every destination icon to show/hide numbers based on mode */
  refreshAllDestinationIcons(): void {
    this.destinations.forEach((dest) => {
      dest.marker.setIcon(this.destinationIcon(dest.id));
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
  loadFromLocalStorage(): void {
    const data = localStorage.getItem('smart-transport-data');
    if (!data) return;

    try {
      const parsed = JSON.parse(data);

      // Clear existing data
      this.stops.clear();
      this.routes.clear();
      this.areas.clear();
      this.destinations.clear();
      this.drawnItems.clearLayers();
      this.snapTargetGroup.clearLayers();

      // Load stops
      if (parsed.stops && Array.isArray(parsed.stops)) {
        parsed.stops.forEach((stopData: any) => {
          const marker = L.marker([stopData.lat, stopData.lng], {
            icon: this.stopIcon('free', stopData.id, false),
            draggable: false,
          });

          marker.addTo(this.drawnItems);

          const circle = L.circle([stopData.lat, stopData.lng], {
            radius: 300,
            color: '#2196F3',
            fillColor: '#2196F3',
            fillOpacity: 0.15,
            opacity: 0.5,
            weight: 2,
          });

          const stop: BusStop = {
            id: stopData.id,
            name: stopData.name,
            busLines: stopData.busLines || [],
            hasShelter: stopData.hasShelter || false,
            latLng: L.latLng(stopData.lat, stopData.lng),
            marker,
            circle,
            connectedRouteIds: new Set(stopData.connectedRouteIds || []),
            areas: [],
            nearbyDestinationIds: [],
          };

          marker.bindTooltip(stop.name);
          this.stops.set(stop.id, stop);
          this.snapTargetGroup.addLayer(marker);

          if (this.mode === 'view') {
            circle.addTo(this.map);
          }

          // Update stopIdCounter
          if (stopData.id > this.stopIdCounter) {
            this.stopIdCounter = stopData.id;
          }
        });
      }

      // Load routes
      if (parsed.routes && Array.isArray(parsed.routes)) {
        parsed.routes.forEach((routeData: any, index: number) => {
          const latlngs = routeData.points.map((p: any) =>
            L.latLng(p.lat, p.lng),
          );
          const color = this.getRouteColor(index);

          const polyline = L.polyline(latlngs, {
            color: color,
            weight: 4,
            opacity: 0.8,
          });

          polyline.addTo(this.drawnItems);

          const points = this.buildRoutePoints(latlngs, routeData.id);
          const stopIds =
            routeData.stopIds ||
            points
              .filter((p: any) => p.stopId !== null)
              .map((p: any) => p.stopId);

          const route: BusRoute = {
            id: routeData.id,
            name: routeData.name,
            stopIds,
            points,
            polyline,
          };

          polyline.bindTooltip(route.name);

          polyline.on('pm:edit', () => {
            const newLL = polyline.getLatLngs() as L.LatLng[];
            route.points = this.buildRoutePoints(newLL, routeData.id);
            route.stopIds = route.points
              .filter((p) => p.stopId !== null)
              .map((p) => p.stopId!);

            if (this.mode === 'view') {
              this.showRouteTexts();
            }

            this.refreshAllStopIcons();
          });

          this.routes.set(route.id, route);

          // Update routeIdCounter
          if (routeData.id > this.routeIdCounter) {
            this.routeIdCounter = routeData.id;
          }
        });

        if (this.mode === 'view') {
          this.showRouteTexts();
        }
      }

      // Load areas
      if (parsed.areas && Array.isArray(parsed.areas)) {
        parsed.areas.forEach((areaData: any) => {
          const latlngs = areaData.latlngs.map((ring: any) =>
            ring.map((p: any) => L.latLng(p.lat, p.lng)),
          );

          const polygon = L.polygon(latlngs, {
            color: '#E91E63',
            weight: 3,
            fillOpacity: 0.2,
          });

          polygon.addTo(this.drawnItems);

          const area: AreaPolygon = {
            id: areaData.id,
            name: areaData.name || null,
            polygon,
            areaM2: areaData.areaM2,
            population: areaData.population || 0,
            highPercentageOfElderly: areaData.highPercentageOfElderly || false,
            servingLines: areaData.servingLines || [],
            populationDensity: areaData.populationDensity || 0,
            publicTransportUsagePercent:
              areaData.publicTransportUsagePercent || 5,
            destinationIds: [],
          };

          this.areas.set(area.id, area);
          this.bindAreaPopup(area);

          if (this.mode === 'view') {
            polygon.openTooltip();
          }

          polygon.on('pm:edit', () => {
            area.areaM2 = this.calcArea(polygon);
            area.populationDensity = this.calculatePopulationDensity(
              area.population,
              area.areaM2,
            );
            this.bindAreaPopup(area);
          });

          // Update idCounter
          const idNum = parseInt(area.id.split('_')[1]);
          if (idNum > this.idCounter) {
            this.idCounter = idNum;
          }
        });
      }

      // Load destinations
      if (parsed.destinations && Array.isArray(parsed.destinations)) {
        parsed.destinations.forEach((destData: any) => {
          const marker = L.marker([destData.lat, destData.lng], {
            icon: this.destinationIcon(destData.id),
            draggable: false,
          });

          marker.addTo(this.drawnItems);

          const destination: TravelDestination = {
            id: destData.id,
            name: destData.name,
            latLng: L.latLng(destData.lat, destData.lng),
            marker,
          };

          marker.bindTooltip(destination.name);
          this.destinations.set(destination.id, destination);

          // Update destinationIdCounter
          if (destData.id > this.destinationIdCounter) {
            this.destinationIdCounter = destData.id;
          }
        });
      }

      // Refresh icons and popups
      this.refreshAllStopIcons();
      this.refreshAllAreaPopups();
      // Update stop area service info
      this.updateAllStopsAreaInfo();
      // Update destination relationships
      this.updateAllDestinationRelationships();
    } catch (e) {
      console.error('Error loading data from localStorage:', e);
    }
  }

  saveToLocalStorage(): void {
    const data = this.exportData();
    localStorage.setItem('smart-transport-data', JSON.stringify(data));
  }

  exportData(): object {
    const stopsArr = Array.from(this.stops.values()).map((s) => ({
      id: s.id,
      name: s.name,
      busLines: s.busLines,
      hasShelter: s.hasShelter,
      lat: s.latLng.lat,
      lng: s.latLng.lng,
      connectedRouteIds: [...s.connectedRouteIds],
      areas: s.areas,
      nearbyDestinationIds: s.nearbyDestinationIds,
    }));
    const routesArr = Array.from(this.routes.values()).map((r) => ({
      id: r.id,
      name: r.name,
      stopIds: r.stopIds,
      points: r.points.map((p) => ({
        lat: p.latLng.lat,
        lng: p.latLng.lng,
        stopId: p.stopId,
      })),
    }));
    const areasArr = Array.from(this.areas.values()).map((a) => ({
      id: a.id,
      name: a.name,
      areaM2: a.areaM2,
      population: a.population,
      highPercentageOfElderly: a.highPercentageOfElderly,
      servingLines: [...a.servingLines],
      populationDensity: a.populationDensity,
      publicTransportUsagePercent: a.publicTransportUsagePercent,
      destinationIds: a.destinationIds,
      latlngs: (a.polygon.getLatLngs() as L.LatLng[][]).map((ring) =>
        ring.map((ll) => ({ lat: ll.lat, lng: ll.lng })),
      ),
    }));
    const destinationsArr = Array.from(this.destinations.values()).map((d) => ({
      id: d.id,
      name: d.name,
      lat: d.latLng.lat,
      lng: d.latLng.lng,
    }));
    return {
      stops: stopsArr,
      routes: routesArr,
      areas: areasArr,
      destinations: destinationsArr,
    };
  }

  /** Reload areas data from localStorage and update stop area info */
  reloadAreasFromStorage(): void {
    const data = localStorage.getItem('smart-transport-data');
    if (!data) return;

    try {
      const parsed = JSON.parse(data);

      // Update area properties from localStorage
      if (parsed.areas && Array.isArray(parsed.areas)) {
        parsed.areas.forEach((areaData: any) => {
          const area = this.areas.get(areaData.id);
          if (area) {
            // Update area properties that can be changed via form
            area.name = areaData.name;
            area.population = areaData.population;
            area.highPercentageOfElderly = areaData.highPercentageOfElderly;
            area.servingLines = areaData.servingLines || [];
            area.populationDensity = areaData.populationDensity;
            area.publicTransportUsagePercent =
              areaData.publicTransportUsagePercent;

            // Rebind popup with updated data
            this.bindAreaPopup(area);
          }
        });
      }

      // Update stop area info with new area data
      this.updateAllStopsAreaInfo();

      // Update destination relationships
      this.updateAllDestinationRelationships();

      // Save updated stop data back to localStorage
      this.saveToLocalStorage();
    } catch (e) {
      console.error('Error reloading areas from localStorage:', e);
    }
  }

  clearAll(): void {
    this.disableAll();
    this.drawnItems.clearLayers();
    this.snapTargetGroup.clearLayers();
    this.stops.clear();
    this.routes.clear();
    this.areas.clear();
    this.destinations.clear();
    this.saveToLocalStorage();
  }
}
