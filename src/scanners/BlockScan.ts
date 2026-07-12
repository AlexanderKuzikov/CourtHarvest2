import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ProgressTracker } from '../core/ProgressTracker.js';
import { CourtData } from '../types/dadata.js';

export interface ScanResult {
  prefix: string; knownBefore: number; found: number; requests: number;
}

const BLOCKS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));

/**
 * Блочный перебор префикса RRTT.
 * 100 блоков (RRTT00–RRTT99) + углубление горячих.
 */
export async function scanPrefix(
  tracker: ProgressTracker,
  prefix: string,
  dataDir: string,
): Promise<ScanResult> {
  const courts: CourtData[] = [];
  let totalRequests = 0;
  let barBlock = 0;
  let bar = '';

  for (let bi = 0; bi < BLOCKS.length; bi++) {
    const block = BLOCKS[bi];
    const query = prefix + block;

    totalRequests++;
    await tracker.trackRequest();
    const client = tracker.getClient();
    const resp = await client.suggestCourt(query, { count: 20 });
    const results = resp.suggestions.map(s => s.data);
    addNewCourts(courts, results);

    if (results.length === 20) {
      const deepened = await deepenBlock(tracker, prefix, block, courts);
      totalRequests += deepened.requests;
    }

    bar += results.length > 0 ? '█' : '·';
    barBlock++;

    if (barBlock % 25 === 0 || bi === BLOCKS.length - 1) {
      console.log(`   ${bar} ${bi + 1}/100`);
      bar = '';
    }
  }

  // Сохраняем в файл
  savePrefixData(dataDir, prefix, courts);

  tracker.addFound(courts.length);

  return { prefix, knownBefore: 0, found: courts.length, requests: totalRequests };
}

async function deepenBlock(
  tracker: ProgressTracker,
  prefix: string,
  block: string,
  courts: CourtData[],
): Promise<{ requests: number }> {
  let requests = 0;
  for (let d = 0; d <= 9; d++) {
    const query = prefix + block + d;
    requests++;
    await tracker.trackRequest();
    const client = tracker.getClient();
    const resp = await client.suggestCourt(query, { count: 20 });
    addNewCourts(courts, resp.suggestions.map(s => s.data));
  }
  return { requests };
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
