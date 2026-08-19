export interface LogEntry {
  id: number;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  source: string;
  message: string;
}

interface IntensityProfile {
  regexIterations: number;
  reversePasses: number;
}

export class LogProcessor {
  private logs: LogEntry[] = [];

  private static readonly LEVELS: LogEntry['level'][] = ['INFO', 'WARN', 'ERROR', 'DEBUG'];
  private static readonly SOURCES = [
    'auth-service', 'api-gateway', 'db-connector', 'cache-layer',
    'payment-svc', 'notification-worker', 'search-engine', 'analytics',
    'rate-limiter', 'event-bus', 'session-store', 'audit-log',
  ];
  private static readonly MESSAGES = [
    'Request completed successfully',
    'Connection timeout exceeded after 30s',
    'Retrying after exponential backoff',
    'Cache miss — fetching from origin server',
    'Rate limit reached for client IP',
    'JWT token validation failed — expired',
    'Batch job started with 500 items',
    'Queue depth exceeds warning threshold of 1000',
    'Circuit breaker opened for downstream service',
    'Health check passed — latency 12ms',
    'Failed to parse response body — invalid JSON',
    'Scheduled task executed — next run in 60s',
    'Database connection pool exhausted',
    'Retry attempt 3 of 5 — service unavailable',
    'Webhook delivered successfully to endpoint',
    'Memory usage at 82% — approaching limit',
  ];

  private static readonly INTENSITY_PROFILES: Record<number, IntensityProfile> = {
    1: { regexIterations: 2,  reversePasses: 0 },
    2: { regexIterations: 8,  reversePasses: 2 },
    3: { regexIterations: 20, reversePasses: 5 },
    4: { regexIterations: 40, reversePasses: 10 },
  };

  generateLogs(count: number): void {
    const lvls = LogProcessor.LEVELS;
    const srcs = LogProcessor.SOURCES;
    const msgs = LogProcessor.MESSAGES;
    const now = Date.now();

    this.logs = Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      timestamp: new Date(now - i * 350).toISOString(),
      level: lvls[Math.floor(Math.random() * lvls.length)],
      source: srcs[Math.floor(Math.random() * srcs.length)],
      message: msgs[Math.floor(Math.random() * msgs.length)],
    }));
  }

  get size(): number {
    return this.logs.length;
  }

  filterSync(term: string, intensity: number): LogEntry[] {
    const clamped = Math.max(1, Math.min(4, intensity)) as 1 | 2 | 3 | 4;
    const profile = LogProcessor.INTENSITY_PROFILES[clamped];
    const termLower = term.toLowerCase();
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const termRegex = new RegExp(escaped, 'gi');
    const results: LogEntry[] = [];

    for (let i = 0; i < this.logs.length; i++) {
      const entry = this.logs[i];

      const composite = `[${entry.level}] ${entry.source} :: ${entry.message} @ ${entry.timestamp}`;

      let normalised = composite.toLowerCase();
      for (let p = 0; p < profile.reversePasses; p++) {
        normalised = normalised.split('').reverse().join('');
        normalised = normalised.split('').reverse().join('');
      }

      let regexHit = false;
      for (let j = 0; j < profile.regexIterations; j++) {
        termRegex.lastIndex = 0;
        if (termRegex.test(composite)) regexHit = true;
      }

      const words = normalised.split(' ');
      const rebuilt = words.filter(w => w.length > 0).join('-');

      let checksum = 0;
      for (let c = 0; c < rebuilt.length; c++) {
        checksum = (checksum * 31 + rebuilt.charCodeAt(c)) & 0xffffffff;
      }
      void checksum;

      const matched =
        regexHit ||
        rebuilt.includes(termLower) ||
        entry.level.toLowerCase() === termLower;

      if (matched) results.push(entry);
    }

    return results;
  }

  filterAsyncChunked(
    term: string,
    chunkSize: number,
    onProgress: (processed: number, total: number) => void,
    onFirstChunkDone?: () => void,
  ): Promise<LogEntry[]> {
    return new Promise((resolve) => {
      const termLower = term.toLowerCase();
      const total = this.logs.length;
      const results: LogEntry[] = [];
      let index = 0;
      let firstChunk = true;

      const processChunk = () => {
        const end = Math.min(index + chunkSize, total);
        for (let i = index; i < end; i++) {
          const e = this.logs[i];
          if (
            e.message.toLowerCase().includes(termLower) ||
            e.source.toLowerCase().includes(termLower) ||
            e.level.toLowerCase().includes(termLower)
          ) {
            results.push(e);
          }
        }
        index = end;

        if (firstChunk && onFirstChunkDone) {
          firstChunk = false;
          onFirstChunkDone();
        }

        onProgress(index, total);

        if (index < total) {
          setTimeout(processChunk, 0);
        } else {
          queueMicrotask(() => resolve(results));
        }
      };

      setTimeout(processChunk, 0);
    });
  }
}
