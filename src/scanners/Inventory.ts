import { Registry } from '../core/Registry.js';
import { ProgressTracker } from '../core/ProgressTracker.js';
import { ALL_COURT_TYPES } from '../types/dadata.js';

const REGIONS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));
const TOTAL = REGIONS.length * ALL_COURT_TYPES.length; // 1 400

export interface InventoryResult {
  total: number; found: number; empty: number; requests: number;
}

/**
 * Фаза 0: RRTT-инвентаризация.
 * Проверяет все 100×14 = 1 400 комбинаций регион+тип.
 */
export async function runInventory(
  tracker: ProgressTracker,
  registry: Registry,
): Promise<InventoryResult> {
  tracker.begin('Фаза 0: RRTT-инвентаризация', TOTAL);

  let found = 0;
  let empty = 0;
  let requests = 0;
  const lastPrint = { done: 0 };

  for (const region of REGIONS) {
    for (const type of ALL_COURT_TYPES) {
      const prefix = region + type;

      if (registry.hasPrefix(prefix)) {
        if (registry.isKnown(prefix)) found++;
        else empty++;
        tracker.tick();
        printProgress(found, empty, TOTAL, lastPrint);
        continue;
      }

      requests++;
      await tracker.trackRequest();
      const client = tracker.getClient();
      const resp = await client.suggestCourt(prefix, { count: 1 });

      if (resp.suggestions.length > 0) {
        const court = resp.suggestions[0].data;
        const code = court.code;
        const num = code.length >= 8 ? parseInt(code.slice(4), 10) : 0;
        registry.markKnown(prefix, {
          min: num, max: num, count: 1, scanned: false,
          updated: new Date().toISOString(),
        });
        found++;
        tracker.addFound(1);
      } else {
        registry.markEmpty(prefix);
        empty++;
      }

      tracker.tick();
      printProgress(found, empty, TOTAL, lastPrint);
    }
  }

  // Финальная строка прогресса
  const elapsed = tracker.fmt(tracker.phaseElapsed());
  tracker.end();
  process.stdout.write(`\r   [${String(TOTAL).padStart(4)}/${TOTAL}] known: ${found}, empty: ${empty} · ${elapsed}\n`);
  console.log(`   💳 ${tracker.keyInfo()}\n`);

  return { total: TOTAL, found, empty, requests };
}

/** Вывод прогресса одной строкой с \r (перезапись) */
function printProgress(found: number, empty: number, total: number, last: { done: number }): void {
  const done = found + empty;
  // Печатаем каждые 50 или на последнем
  if (done === total || done - last.done >= 50) {
    const pct = ((done / total) * 100).toFixed(0);
    process.stdout.write(`\r   [${String(done).padStart(4)}/${total}] known: ${found}, empty: ${empty} · ${pct}%`);
    last.done = done;
  }
}
