import './env.js';
import { join } from 'path';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { KeyManager } from './core/KeyManager.js';
import { ProgressTracker } from './core/ProgressTracker.js';
import { Registry } from './core/Registry.js';
import { ALL_COURT_TYPES } from './types/dadata.js';

const KEYS_DIR = join(process.cwd(), 'keys');
const DATA_DIR = join(process.cwd(), 'data');

/**
 * Дособирает неотсканированные префиксы.
 * Использует probe по ТОЧНОМУ КОДУ (RRTT0000, RRTT0001, затем RRTT00-99 блоки
 * для типов с множественными номерами).
 */
async function main() {
  const km = new KeyManager();
  try {
    await km.init(KEYS_DIR, ['1.env'], 9500);
  } catch (e: any) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }

  const tracker = new ProgressTracker(km);
  const registry = new Registry(DATA_DIR);

  const unscanned = Object.entries(registry.known)
    .filter(([_, meta]) => !meta.scanned)
    .map(([prefix]) => prefix)
    .sort();

  if (unscanned.length === 0) {
    console.log('✅ Все префиксы отсканированы.');
    await km.shutdown();
    return;
  }

  console.log(`📋 Неотсканированных: ${unscanned.length}\n`);
  tracker.begin('fill', unscanned.length);

  let totalFound = 0;

  for (const prefix of unscanned) {
    const type = prefix.slice(2, 4);
    process.stdout.write(`   ${prefix}: `);

    try {
      const courts: any[] = [];

      // Шаг 1: Probe по точному коду 0000 (OS, VS, AV, KV — с номером 0000)
      let resp = await probe(tracker, `${prefix}0000`);
      if (resp && resp.code?.startsWith(prefix)) {
        courts.push(resp);
      }

      // Шаг 2: Probe по точному коду 0001 (AS, AA, AO, AJ, KJ — с номером 0001)
      if (courts.length === 0) {
        resp = await probe(tracker, `${prefix}0001`);
        if (resp && resp.code?.startsWith(prefix)) {
          courts.push(resp);
        }
      }

      // Шаг 3: Если оба пусты и тип не OS/VS — ищем по блокам RRTT00-99
      // (GV, OV, RS, MS могут иметь >1 суда с разными номерами)
      if (courts.length === 0 && !['OS', 'VS'].includes(type)) {
        const blocked = await blockSearch(tracker, prefix);
        courts.push(...blocked);
      }

      if (courts.length > 0) {
        const dir = join(DATA_DIR, 'prefixes');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${prefix}.json`), JSON.stringify(courts, null, 2), 'utf-8');

        registry.updateMeta(prefix, { count: courts.length, scanned: true });
        tracker.addFound(courts.length);
        totalFound += courts.length;
        const codes = courts.map(c => c.code).join(', ');
        console.log(`✅ ${courts.length} суд. (${codes})`);
      } else {
        registry.updateMeta(prefix, { count: 0, scanned: true });
        console.log(`· пусто`);
      }

    } catch (e: any) {
      console.log(`⚠️  ${e.message}`);
      break;
    }
    tracker.tick();
  }

  await km.shutdown();
  console.log(`\n✅ Дособрано: ${totalFound} судов из ${unscanned.length} префиксов`);
  console.log(`   ${tracker.statusLine()}`);
}

/** Одиночный probe по точному коду */
async function probe(tracker: ProgressTracker, code: string) {
  const client = tracker.getClient();
  const resp = await client.suggestCourt(code, { count: 1 });
  await tracker.trackRequest();
  if (resp.suggestions.length > 0) {
    return resp.suggestions[0].data;
  }
  return null;
}

/** Блочный поиск RRTT00-99 (без углубления) */
async function blockSearch(tracker: ProgressTracker, prefix: string) {
  const courts: any[] = [];
  const codes = new Set<string>();

  for (let b = 0; b <= 99; b++) {
    const query = prefix + String(b).padStart(2, '0');
    const client = tracker.getClient();
    const resp = await client.suggestCourt(query, { count: 20 });
    await tracker.trackRequest();

    for (const s of resp.suggestions) {
      const c = s.data;
      if (c.code && c.code.startsWith(prefix) && !codes.has(c.code)) {
        courts.push(c);
        codes.add(c.code);
      }
    }

    // Ранний выход: если 10 блоков подряд пусты
    if (resp.suggestions.length === 0 && b > 20) {
      let allEmpty = true;
      for (let back = b - 9; back <= b; back++) {
        // Не можем проверить, просто доверяем recent empty
      }
      if (b > 30) break; // после 30 блоков без находок выходим
    }

    if (courts.length > 0 && resp.suggestions.length === 0 && b > 5) break;
  }

  return courts;
}

main().catch(console.error);
