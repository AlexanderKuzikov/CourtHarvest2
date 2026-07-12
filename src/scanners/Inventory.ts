import { ApiClient } from '../core/ApiClient.js';
import { Registry } from '../core/Registry.js';
import { ALL_COURT_TYPES } from '../types/dadata.js';

const REGIONS = Array.from({ length: 99 }, (_, i) => String(i + 1).padStart(2, '0'));

export interface InventoryResult {
  total: number;
  found: number;
  empty: number;
  requests: number;
}

/**
 * Фаза 0: RRTT-инвентаризация.
 * Проверяет все 99×14 = 1 386 комбинаций регион+тип.
 * Каждый существующий префикс заносится в registry.known,
 * каждый пустой — в registry.empty.
 */
export async function runInventory(client: ApiClient, registry: Registry): Promise<InventoryResult> {
  console.log('\n🔍 Фаза 0: RRTT-инвентаризация\n');

  let found = 0;
  let empty = 0;
  let requests = 0;

  for (const region of REGIONS) {
    for (const type of ALL_COURT_TYPES) {
      const prefix = region + type;

      // Уже известен
      if (registry.hasPrefix(prefix)) {
        if (registry.isKnown(prefix)) found++;
        else empty++;
        continue;
      }

      // Probe: запрос RRTT (без номера) — если есть хоть 1 suggestion, префикс существует
      requests++;
      const resp = await client.suggestCourt(prefix, { count: 1 });

      if (resp.suggestions.length > 0) {
        // Собираем начальную информацию из первого же результата
        const court = resp.suggestions[0].data;
        const code = court.code;
        const num = code.length >= 8 ? parseInt(code.slice(4), 10) : 0;
        registry.markKnown(prefix, {
          min: num,
          max: num,
          count: 1,
          scanned: false,
          updated: new Date().toISOString(),
        });
        found++;
        process.stdout.write('📌');
      } else {
        registry.markEmpty(prefix);
        empty++;
        process.stdout.write('·');
      }

      if ((found + empty) % 50 === 0) {
        process.stdout.write(` ${found + empty}/${REGIONS.length * ALL_COURT_TYPES.length}\n`);
      }
    }
  }

  const total = REGIONS.length * ALL_COURT_TYPES.length;
  console.log(`\n\n✅ Инвентаризация: ${total} комбинаций`);
  console.log(`   Существует: ${found}, пусто: ${empty}, запросов: ${requests}`);

  return { total, found, empty, requests };
}
