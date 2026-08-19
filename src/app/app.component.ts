import {
  Component,
  OnInit,
  signal,
  computed,
  inject,
  NgZone,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LogEntry, LogProcessor } from './models/log-processor';
import { InpMeasurementService } from './services/inp-measurement.service';

export interface BlockingLevel {
  intensity: number;
  label: string;
  expectedRange: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  private readonly processor = new LogProcessor();
  private readonly zone = inject(NgZone);
  readonly inp = inject(InpMeasurementService);

  private blockingClickCount = 0;

  readonly searchTerm = signal('error');
  readonly results = signal<LogEntry[]>([]);
  readonly isRunning = signal(false);
  readonly lastMode = signal<'sync' | 'async' | null>(null);
  readonly progress = signal(0);
  readonly totalLogs = 100_000;
  readonly currentIntensity = signal(0);

  readonly BLOCKING_LEVELS: BlockingLevel[] = [
    { intensity: 1, label: 'Nivel 1 — Rápido',    expectedRange: '~100–180ms · Bueno' },
    { intensity: 2, label: 'Nivel 2 — Moderado',   expectedRange: '~250–350ms · Necesita Mejora' },
    { intensity: 3, label: 'Nivel 3 — Pesado',     expectedRange: '~400–480ms · Necesita Mejora' },
    { intensity: 4, label: 'Nivel 4 — Máximo',     expectedRange: '>600ms · Pobre 🥶' },
  ];

  readonly activeLevel = computed(() => {
    const n = this.currentIntensity();
    if (n === 0) return null;
    const idx = Math.min(n, 4) - 1;
    return this.BLOCKING_LEVELS[idx];
  });

  readonly nextLevel = computed(() => {
    const n = this.currentIntensity();
    if (n === 0) return this.BLOCKING_LEVELS[0];
    if (n >= 4) return null;
    return this.BLOCKING_LEVELS[n];
  });

  readonly preview = computed(() => this.results().slice(0, 20));
  readonly metrics = this.inp.metrics;

  readonly levelClass: Record<string, string> = {
    INFO:  'level-info',
    WARN:  'level-warn',
    ERROR: 'level-error',
    DEBUG: 'level-debug',
  };

  ngOnInit(): void {
    this.processor.generateLogs(this.totalLogs);
  }

  onTermChange(value: string): void {
    this.searchTerm.set(value);
    this._resetBlockingCounter();
  }

  runBlocking(): void {
    if (this.isRunning()) return;

    this.blockingClickCount = Math.min(this.blockingClickCount + 1, 4);
    this.currentIntensity.set(this.blockingClickCount);

    this.inp.startInput();
    this.lastMode.set('sync');
    this.results.set([]);
    this.progress.set(0);
    this.isRunning.set(true);

    this.inp.endInput();

    const found = this.processor.filterSync(this.searchTerm(), this.blockingClickCount);

    this.results.set(found);
    this.progress.set(100);
    this.isRunning.set(false);

    this.inp.endProcess();
  }

  runOptimized(): void {
    if (this.isRunning()) return;

    this._resetBlockingCounter();

    this.inp.startInput();
    this.lastMode.set('async');
    this.results.set([]);
    this.progress.set(0);
    this.isRunning.set(true);

    this.inp.endInput();

    this.zone.runOutsideAngular(() => {
      this.processor
        .filterAsyncChunked(
          this.searchTerm(),
          2000,
          (processed, total) => {
            const pct = Math.round((processed / total) * 100);
            this.zone.run(() => this.progress.set(pct));
          },
          () => {
            this.zone.run(() => this.inp.endProcess());
          },
        )
        .then((found) => {
          this.zone.run(() => {
            this.results.set(found);
            this.isRunning.set(false);
          });
        });
    });
  }

  private _resetBlockingCounter(): void {
    this.blockingClickCount = 0;
    this.currentIntensity.set(0);
  }
}
