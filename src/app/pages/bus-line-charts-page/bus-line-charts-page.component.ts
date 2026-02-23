import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

interface BusLineData {
  id: number;
  name: string;
  stopIds: number[];
  points: { lat: number; lng: number; stopId: number | null }[];
}

@Component({
  selector: 'app-bus-line-charts-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bus-line-charts-page.component.html',
  styleUrls: ['./bus-line-charts-page.component.css'],
})
export class BusLineChartsPageComponent implements OnInit {
  lineId: number | null = null;
  line: BusLineData | null = null;
  notFound: boolean = false;

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

      // Find the line by ID
      this.line = routes.find((r: BusLineData) => r.id === this.lineId);

      if (!this.line) {
        this.notFound = true;
        return;
      }
    } catch (e) {
      console.error('Error loading line data:', e);
      this.notFound = true;
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
