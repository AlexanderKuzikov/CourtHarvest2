import { Registry } from '../core/Registry.js';
import { ProgressTracker } from '../core/ProgressTracker.js';
import { ALL_COURT_TYPES } from '../types/dadata.js';

const REGIONS = Array.from({ length: 99 }, (_, i) => String(i + 1).padStart(2, '0'));

const TOTAL = REGIONS.length * ALL_COURT_TYPES.length; // 1 386

export interface InventoryResult {
  total: number; found: number; empty: number; requests: number;
}

/**
 * Фаза 0: RRTT-инвентаризация.
 * Проверяет все 99×14 = 1 386 комбинаций регион+тип.
 */
export async function runInventory(
  tracker: ProgressTracker,
  registry: Registry,
): Promise<InventoryResult> {
  tracker.begin('Фаза 0: RRTT-инвентаризация', TOTAL);

  let found = 0;
  let empty = 0;
  let requests = 0;
  let bar = '';

  for (const region of REGIONS) {
    for (const type of ALL_COURT_TYPES) {
      const prefix = region + type;

      if (registry.hasPrefix(prefix)) {
        if (registry.isKnown(prefix)) found++;
        else empty++;
        tracker.tick();
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
        bar += '📌';
      } else {
        registry.markEmpty(prefix);
        empty++;
        bar += '·';
      }

      const done = found + empty;
      if (done % 50 === 0) {
        console.log(`   ${bar}  ${done}/${TOTAL}`);
        bar = '';
      }

      tracker.tick(1, undefined);
    }
  }

  if (bar) console.log(`   ${bar}  ${TOTAL}/${TOTAL}`);

  tracker.end();
  console.log(`   📊 known: ${found}, empty: ${empty}, запросов: ${requests}`);
  console.log(`   ${tracker.statusLine()}\n`);

  return { total: TOTAL, found, empty, requests };
}
