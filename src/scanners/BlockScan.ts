import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ProgressTracker } from '../core/ProgressTracker.js';
import { CourtData } from '../types/dadata.js';

export interface ScanResult {
  prefix: string; found: number; requests: number;
}

const BLOCKS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));

/**
 * Блочный перебор префикса RRTT.
 * 100 блоков (RRTT00–RRTT99) + углубление горячих (ровно 20).
 * Вывод: одна строка с баром.
 */
export async function scanPrefix(
  tracker: ProgressTracker,
  prefix: string,
  dataDir: string,
): Promise<ScanResult> {
  const courts: CourtData[] = [];
  let totalRequests = 0;
  let bar = '';

  for (let bi = 0; bi < BLOCKS.length; bi++) {
    const query = prefix + BLOCKS[bi];

    totalRequests++;
    await tracker.trackRequest();
    const client = tracker.getClient();
    const resp = await client.suggestCourt(query, { count: 20 });
    const results = resp.suggestions.map(s => s.data);
    addNewCourts(courts, results);

    if (results.length === 20) {
      const deepened = await deepenBlock(tracker, prefix, BLOCKS[bi], courts);
      totalRequests += deepened;
    }

    bar += results.length > 0 ? '█' : '·';
  }

  // Сохраняем
  savePrefixData(dataDir, prefix, courts);
  tracker.addFound(courts.length);

  return { prefix, found: courts.length, requests: totalRequests };
}

async function deepenBlock(
  tracker: ProgressTracker,
  prefix: string,
  block: string,
  courts: CourtData[],
): Promise<number> {
  let requests = 0;
  for (let d = 0; d <= 9; d++) {
    requests++;
    await tracker.trackRequest();
    const client = tracker.getClient();
    const resp = await client.suggestCourt(prefix + block + d, { count: 20 });
    addNewCourts(courts, resp.suggestions.map(s => s.data));
  }
  return requests;
}

function addNewCourts(storage: CourtData[], candidates: CourtData[]): void {
  const codes = new Set(storage.map(c => c.code));
  for (const c of candidates) {
    if (c.code && !codes.has(c.code)) {
      storage.push(c);
      codes.add(c.code);
    }
  }
}

function savePrefixData(dataDir: string, prefix: string, courts: CourtData[]): void {
  const dir = join(dataDir, 'prefixes');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${prefix}.json`), JSON.stringify(courts, null, 2), 'utf-8');
}
