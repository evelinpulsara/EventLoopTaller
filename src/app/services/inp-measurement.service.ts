import { Injectable, signal } from '@angular/core';

export type InpStatus = 'good' | 'needs-improvement' | 'poor';

export interface InpMetrics {
  tInput: number;
  tProcess: number;
  tPaint: number;
  total: number;
  status: InpStatus;
  measured: boolean;
}

@Injectable({ providedIn: 'root' })
export class InpMeasurementService {
  private _interactionStart = 0;
  private _processStart = 0;
  private _tInput = 0;
  private _tProcess = 0;

  readonly metrics = signal<InpMetrics>({
    tInput: 0,
    tProcess: 0,
    tPaint: 0,
    total: 0,
    status: 'good',
    measured: false,
  });

  startInput(): void {
    this._interactionStart = performance.now();
    this._tInput = 0;
    this._tProcess = 0;
  }

  endInput(): void {
    this._tInput = +(performance.now() - this._interactionStart).toFixed(2);
    this._processStart = performance.now();
  }

  endProcess(): void {
    this._tProcess = +(performance.now() - this._processStart).toFixed(2);
    this._capturePaint();
  }

  private _capturePaint(): void {
    const tInput = this._tInput;
    const tProcess = this._tProcess;
    const afterProcess = performance.now();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const tPaint = +(performance.now() - afterProcess).toFixed(2);
        const total = +(tInput + tProcess + tPaint).toFixed(2);
        this.metrics.set({
          tInput,
          tProcess,
          tPaint,
          total,
          status: this._classify(total),
          measured: true,
        });
      });
    });
  }

  private _classify(total: number): InpStatus {
    if (total <= 200) return 'good';
    if (total <= 500) return 'needs-improvement';
    return 'poor';
  }
}
