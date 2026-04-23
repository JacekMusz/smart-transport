import {
  Component,
  OnInit,
  AfterViewInit,
  ViewChild,
  ElementRef,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Chart,
  ChartConfiguration,
  TooltipItem,
  registerables,
} from 'chart.js';
import { VehicleSchedule } from '../../models';

Chart.register(...registerables);

interface BusLineData {
  id: number;
  name: string;
  stopIds: number[];
  points: { lat: number; lng: number; stopId: number | null }[];
}

interface BusStopData {
  id: number;
  name: string;
  busLines: number[];
  hasShelter: boolean;
  busLoop: boolean;
  lat: number;
  lng: number;
}

interface Direction {
  label: string;
  stops: BusStopData[];
}

@Component({
  selector: 'app-bus-line-charts-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bus-line-charts-page.component.html',
  styleUrls: ['./bus-line-charts-page.component.css'],
})
export class BusLineChartsPageComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  @ViewChild('scheduleChart') scheduleChartRef!: ElementRef<HTMLCanvasElement>;

  lineId: number | null = null;
  line: BusLineData | null = null;
  stops: BusStopData[] = [];
  directions: Direction[] = [];
  vehicleSchedule: VehicleSchedule = { lineId: 0, vehicles: [] };
  notFound: boolean = false;
  chart: Chart | null = null;

  // Y position (metres from loop1) keyed by stopId
  private stopYMetres: Map<number, number> = new Map();
  private maxY: number = 1;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const id = params['id'];
      this.lineId = id ? parseInt(id, 10) : null;
      if (this.lineId) {
        this.loadLineData();
      } else {
        this.notFound = true;
      }
    });
  }

  loadLineData(): void {
    const data = localStorage.getItem('smart-transport-data');
    if (!data) {
      this.notFound = true;
      return;
    }

    try {
      const parsed = JSON.parse(data);
      const routes = parsed.routes || [];
      const allStops: BusStopData[] = parsed.stops || [];

      this.line = routes.find((r: BusLineData) => r.id === this.lineId);
      if (!this.line) {
        this.notFound = true;
        return;
      }

      this.stops = allStops;

      const orderedStops: BusStopData[] = this.line.stopIds
        .map((id) => allStops.find((s) => s.id === id))
        .filter((s): s is BusStopData => s !== undefined);

      this.buildDirections(orderedStops);
      this.buildYAxisStops();
      this.loadScheduleFromStorage();
    } catch (e) {
      console.error('Error loading line data:', e);
      this.notFound = true;
    }
  }

  private buildDirections(allStops: BusStopData[]): void {
    if (allStops.length === 0) {
      this.directions = [];
      return;
    }

    const loopPositions = allStops
      .map((s, i) => ({ stop: s, index: i }))
      .filter((x) => x.stop.busLoop);

    const hasTwoDistinctLoops =
      loopPositions.length >= 2 &&
      loopPositions[0].stop.id !== loopPositions[1].stop.id;

    if (!hasTwoDistinctLoops) {
      this.directions = [
        {
          label: `${allStops[0].name} → ${allStops[allStops.length - 1].name}`,
          stops: allStops,
        },
      ];
      return;
    }

    const splitIndex = loopPositions[1].index;
    const dir1 = allStops.slice(0, splitIndex + 1);
    const dir2 = allStops.slice(splitIndex);

    this.directions = [
      {
        label: `${dir1[0].name} → ${dir1[dir1.length - 1].name}`,
        stops: dir1,
      },
      {
        label: `${dir2[0].name} → ${dir2[dir2.length - 1].name}`,
        stops: dir2,
      },
    ];
  }

  /**
   * Combined Y-axis: dir1 stops (Y=0..N1-1), then dir2 stops[1:] (Y=N1..N1+N2-2).
   * The shared loop2 stop sits at Y = N1-1 (bottom of left axis / top of right axis).
   */
  private buildYAxisStops(): void {
    if (!this.line || !this.line.points || this.line.points.length < 2) return;

    const points = this.line.points;

    // Compute cumulative distance from first point along the full route
    const cumDist: number[] = [0];
    for (let i = 1; i < points.length; i++) {
      cumDist.push(
        cumDist[i - 1] +
          this.haversine(
            points[i - 1].lat,
            points[i - 1].lng,
            points[i].lat,
            points[i].lng,
          ),
      );
    }

    // Find loop2 point index (first busLoop stop that is NOT loop1)
    const dir1 = this.directions[0]?.stops ?? [];
    const dir2 = this.directions.length >= 2 ? this.directions[1].stops : [];
    const loop2Id = dir1.length > 0 ? dir1[dir1.length - 1].id : null;

    const loop2PointIdx =
      loop2Id !== null
        ? points.findIndex((p) => p.stopId === loop2Id)
        : points.length - 1;
    const distToLoop2 =
      loop2PointIdx >= 0 ? cumDist[loop2PointIdx] : cumDist[cumDist.length - 1];

    this.maxY = distToLoop2 > 0 ? distToLoop2 : 1;

    // For every stop in the route compute Y (metres from loop1)
    const allRouteStops = [...dir1, ...dir2.slice(1)];

    for (const stop of allRouteStops) {
      const ptIdx = points.findIndex((p) => p.stopId === stop.id);
      if (ptIdx === -1) continue;
      const rawDist = cumDist[ptIdx];

      // dir1 stops: rawDist is already distance from loop1 (0..distToLoop2)
      // dir2 stops (beyond loop2 in point array): mirror back → distToLoop2 - (rawDist - distToLoop2)
      let y: number;
      if (rawDist <= distToLoop2) {
        y = rawDist;
      } else {
        y = distToLoop2 - (rawDist - distToLoop2);
        if (y < 0) y = 0;
      }
      this.stopYMetres.set(stop.id, y);
    }
  }

  private haversine(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  ngAfterViewInit(): void {
    if (this.vehicleSchedule.vehicles.length > 0) {
      this.createScheduleChart();
    }
  }

  private getScheduleStorageKey(): string {
    return `schedule-line-${this.lineId}`;
  }

  loadScheduleFromStorage(): void {
    const key = this.getScheduleStorageKey();
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        this.vehicleSchedule = JSON.parse(saved);
      } catch (e) {
        this.vehicleSchedule = { lineId: this.lineId || 0, vehicles: [] };
      }
    }
  }

  private parseTimeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  createScheduleChart(): void {
    if (!this.scheduleChartRef || !this.line) return;
    const ctx = this.scheduleChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const dir1 = this.directions[0]?.stops ?? [];
    const dir2 = this.directions.length >= 2 ? this.directions[1].stops : [];

    // Left axis ticks — dir1 stops (loop1 bottom → loop2 top)
    const leftTicks = dir1.map((s) => ({
      value: this.stopYMetres.get(s.id) ?? 0,
      label: s.name,
    }));

    // Right axis ticks — dir2 stops (loop2 top → loop1 bottom)
    const rightTicks = dir2.map((s) => ({
      value: this.stopYMetres.get(s.id) ?? 0,
      label: s.name,
    }));

    // Datasets — one continuous line per vehicle, loop dwell connected between trips
    const datasets = this.vehicleSchedule.vehicles.map((vehicle, vIdx) => {
      const points: { x: number; y: number }[] = [];

      vehicle.trips.forEach((trip) => {
        trip.times.forEach((t) => {
          const y = this.stopYMetres.get(t.stopId);
          if (y !== undefined) {
            points.push({ x: this.parseTimeToMinutes(t.time), y });
          }
        });
      });

      const hue = (vIdx * 137.5) % 360;
      const color = `hsl(${hue}, 70%, 45%)`;
      return {
        label: vehicle.name,
        data: points,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 6,
        tension: 0,
        yAxisID: 'y',
      };
    });

    const allX = datasets.flatMap((d) =>
      (d.data as { x: number; y: number }[])
        .filter((p) => !isNaN(p.x))
        .map((p) => p.x),
    );
    const xMin = allX.length > 0 ? Math.min(...allX) - 15 : 6 * 60;
    const xMax = allX.length > 0 ? Math.max(...allX) + 15 : 22 * 60;

    const stopYRef = this.stopYMetres;
    const allStopsRef = [...dir1, ...dir2];

    // Helper: find closest stop name for a given Y value
    const nameForY = (y: number): string => {
      let best: BusStopData | undefined;
      let bestDist = Infinity;
      for (const s of allStopsRef) {
        const sy = stopYRef.get(s.id) ?? -1;
        const d = Math.abs(sy - y);
        if (d < bestDist) {
          bestDist = d;
          best = s;
        }
      }
      return best?.name ?? '?';
    };

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'linear',
            position: 'bottom',
            min: xMin,
            max: xMax,
            ticks: {
              stepSize: 30,
              callback: (value) => {
                const mins = value as number;
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
              },
            },
            title: { display: true, text: 'Czas' },
          },
          // Left Y axis — dir1 stops, loop1 at bottom (Y=0), loop2 at top (Y=maxY)
          y: {
            type: 'linear',
            position: 'left',
            min: -this.maxY * 0.05,
            max: this.maxY * 1.05,
            reverse: false,
            grid: {
              color: 'rgba(100, 100, 255, 0.2)',
            },
            afterBuildTicks: (axis: any) => {
              axis.ticks = leftTicks.map((t) => ({ value: t.value }));
            },
            ticks: {
              callback: (value) => {
                const t = leftTicks.find(
                  (t) => Math.abs(t.value - (value as number)) < 1,
                );
                return t ? t.label : '';
              },
            },
            title: {
              display: true,
              text:
                dir1.length > 0
                  ? `${dir1[0].name} → ${dir1[dir1.length - 1].name}`
                  : 'Kierunek 1',
            },
          },
          // Right Y axis — dir2 stops, same numeric scale, no grid lines
          y1: {
            type: 'linear',
            position: 'right',
            min: -this.maxY * 0.05,
            max: this.maxY * 1.05,
            reverse: false,
            grid: {
              drawOnChartArea: true,
              color: 'rgba(180, 180, 180, 0.4)',
            },
            afterBuildTicks: (axis: any) => {
              axis.ticks = rightTicks.map((t) => ({ value: t.value }));
            },
            ticks: {
              callback: (value) => {
                const t = rightTicks.find(
                  (t) => Math.abs(t.value - (value as number)) < 1,
                );
                return t ? t.label : '';
              },
            },
            title: {
              display: true,
              text:
                dir2.length > 0
                  ? `${dir2[0].name} → ${dir2[dir2.length - 1].name}`
                  : 'Kierunek 2',
            },
          },
        },
        plugins: {
          legend: { display: true, position: 'top' },
          tooltip: {
            callbacks: {
              label: (context: TooltipItem<'line'>) => {
                const mins = context.parsed.x ?? 0;
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                const stopName = nameForY(context.parsed.y ?? 0);
                return `${context.dataset.label}: ${stopName} o ${time}`;
              },
            },
          },
        },
      },
    };

    if (this.chart) this.chart.destroy();
    this.chart = new Chart(ctx, config);
  }

  ngOnDestroy(): void {
    if (this.chart) this.chart.destroy();
  }

  goBack(): void {
    if (this.lineId) {
      this.router.navigate(['/bus-lines', this.lineId]);
    } else {
      this.router.navigate(['/bus-lines']);
    }
  }
}
