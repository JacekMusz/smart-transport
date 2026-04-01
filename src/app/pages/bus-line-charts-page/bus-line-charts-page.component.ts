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
import { Vehicle, VehicleSchedule, TripSchedule } from '../../models';

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
  lat: number;
  lng: number;
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
  vehicleSchedule: VehicleSchedule = { lineId: 0, vehicles: [] };
  notFound: boolean = false;
  chart: Chart | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    // Get line ID from route params
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
      const stops = parsed.stops || [];

      // Find the line by ID
      this.line = routes.find((r: BusLineData) => r.id === this.lineId);

      if (!this.line) {
        this.notFound = true;
        return;
      }

      // Load all stops
      this.stops = stops;

      // Load schedule from localStorage
      this.loadScheduleFromStorage();
    } catch (e) {
      console.error('Error loading line data:', e);
      this.notFound = true;
    }
  }

  ngAfterViewInit(): void {
    // Create chart after view is initialized
    if (this.vehicleSchedule.vehicles.length > 0) {
      this.createScheduleChart();
    }
  }

  /**
   * Get the localStorage key for this line's schedule
   */
  private getScheduleStorageKey(): string {
    return `schedule-line-${this.lineId}`;
  }

  /**
   * Load schedule from localStorage
   */
  loadScheduleFromStorage(): void {
    const storageKey = this.getScheduleStorageKey();
    const savedSchedule = localStorage.getItem(storageKey);

    if (savedSchedule) {
      try {
        this.vehicleSchedule = JSON.parse(savedSchedule);
      } catch (e) {
        console.error('Error parsing saved schedule:', e);
        this.vehicleSchedule = { lineId: this.lineId || 0, vehicles: [] };
      }
    }
  }

  /**
   * Parse time string (HH:MM) to minutes from 6:00
   */
  private parseTimeToMinutesFrom6AM(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    const sixAM = 6 * 60; // 360 minutes
    return totalMinutes - sixAM;
  }

  /**
   * Get stop name by ID
   */
  private getStopName(stopId: number): string {
    const stop = this.stops.find((s) => s.id === stopId);
    return stop ? stop.name : `Przystanek ${stopId}`;
  }

  /**
   * Create the schedule chart
   */
  createScheduleChart(): void {
    if (!this.scheduleChartRef || !this.line) {
      return;
    }

    const ctx = this.scheduleChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    // Get unique stop IDs from first vehicle's first trip
    const stopIds =
      this.vehicleSchedule.vehicles[0]?.trips[0]?.times.map((t) => t.stopId) ||
      [];

    // Precompute stop names to avoid ID lookup issues in callbacks
    const stopNames: string[] = stopIds.map((id: number) =>
      this.getStopName(id),
    );

    // Prepare datasets - one continuous line for each vehicle
    const datasets = this.vehicleSchedule.vehicles.map(
      (vehicle, vehicleIndex) => {
        // Collect all points from all trips for this vehicle in chronological order
        const allPoints: { x: number; y: number }[] = [];

        vehicle.trips.forEach((trip) => {
          trip.times.forEach((t) => {
            allPoints.push({
              x: this.parseTimeToMinutesFrom6AM(t.time),
              y: stopIds.indexOf(t.stopId),
            });
          });
        });

        // Generate a unique color for each vehicle
        const hue = (vehicleIndex * 137.5) % 360; // Golden angle for better color distribution
        const color = `hsl(${hue}, 70%, 50%)`;

        return {
          label: vehicle.name,
          data: allPoints,
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          tension: 0, // Straight lines between points
        };
      },
    );

    // Calculate axis bounds dynamically based on actual data
    const allX = datasets.flatMap((d) =>
      (d.data as { x: number; y: number }[]).map((p) => p.x),
    );
    const xMin = allX.length > 0 ? Math.min(...allX) - 15 : 0;
    const xMax = allX.length > 0 ? Math.max(...allX) + 15 : 240;

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        datasets: datasets,
      },
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
              callback: function (value: number | string) {
                const totalMinutes = (value as number) + 6 * 60;
                const hours = Math.floor(totalMinutes / 60);
                const mins = totalMinutes % 60;
                return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
              },
            },
            title: {
              display: true,
              text: 'Czas',
            },
          },
          y: {
            type: 'linear',
            min: -0.5,
            max: stopIds.length - 0.5,
            afterBuildTicks: (axis: any) => {
              axis.ticks = stopNames.map((_: any, i: number) => ({ value: i }));
            },
            ticks: {
              callback: (value: number | string) => {
                const index = value as number;
                return stopNames[index] ?? '';
              },
            },
            title: {
              display: true,
              text: 'Przystanki',
            },
          },
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
          },
          tooltip: {
            callbacks: {
              label: (context: TooltipItem<'line'>) => {
                const totalMinutes = (context.parsed.x ?? 0) + 6 * 60;
                const hours = Math.floor(totalMinutes / 60);
                const mins = totalMinutes % 60;
                const time = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
                const stopIndex = context.parsed.y ?? 0;
                const stopName = stopNames[Math.round(stopIndex)] ?? '';
                return `${context.dataset.label}: ${stopName} o ${time}`;
              },
            },
          },
        },
      },
    };

    // Destroy existing chart if it exists
    if (this.chart) {
      this.chart.destroy();
    }

    this.chart = new Chart(ctx, config);
  }

  ngOnDestroy(): void {
    // Clean up chart
    if (this.chart) {
      this.chart.destroy();
    }
  }

  goBack(): void {
    if (this.lineId) {
      this.router.navigate(['/bus-lines', this.lineId]);
    } else {
      this.router.navigate(['/bus-lines']);
    }
  }
}
