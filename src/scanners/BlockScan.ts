import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ApiClient } from '../core/ApiClient.js';
import { Registry, PrefixMeta } from '../core/Registry.js';
import { CourtData } from '../types/dadata.js';

export interface ScanResult {
  prefix: string;
  knownBefore: number;
  found: number;
  requests: number;
}

/**
 * Блочный перебор префикса RRTT.
 *
 * Делит диапазон [0000–9999] на 100 блоков (RRTT00–RRTT99).
 * Каждый блок = 100 кодов, DaData возвращает до 20 подсказок.
 * Блоки, вернувшие ровно 20, углубляются до 10 блоков второго уровня.
 */

const BLOCKS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));

export interface BlockScanOptions {
  dataDir: string;
  onProgress?: (prefix: string, block: number, total: number) => void;
}

export async function scanPrefix(
  client: ApiClient,
  registry: Registry,
  prefix: string,
  options: BlockScanOptions,
): Promise<ScanResult> {
  const knownBefore = registry.known[prefix]?.count ?? 0;
  let totalFound = 0;
  let totalRequests = 0;
  const courts: CourtData[] = [];

  console.log(`\n📋 ${prefix}: сканирование 100 блоков`);

  for (let bi = 0; bi < BLOCKS.length; bi++) {
    const block = BLOCKS[bi];
    const query = prefix + block; // RRTT00 … RRTT99
    options.onProgress?.(prefix, bi + 1, BLOCKS.length);

    totalRequests++;
    const resp = await client.suggestCourt(query, { count: 20 });
    const results = resp.suggestions.map(s => s.data);
    const added = addNewCourts(courts, results);
    totalFound += added;

    // Если блок «горячий» (ровно 20) — углубляемся до 3 цифр
    if (results.length === 20) {
      const deepened = await deepenBlock(client, prefix, block, courts);
      totalFound += deepened.added;
      totalRequests += deepened.requests;
    }

    if (results.length > 0 || added > 0) {
      process.stdout.write('█');
    } else {
      process.stdout.write('·');
    }

    if ((bi + 1) % 25 === 0) process.stdout.write(` ${bi + 1}/100\n`);
  }

  // Обновляем registry
  const nums = courts.map(c => parseInt(c.code.slice(4), 10));
  const meta: PrefixMeta = {
    min: nums.length > 0 ? Math.min(...nums) : 0,
    max: nums.length > 0 ? Math.max(...nums) : 0,
    count: courts.length,
    scanned: true,
    updated: new Date().toISOString(),
  };
  registry.markKnown(prefix, meta);

  // Сохраняем данные префикса
  savePrefixData(options.dataDir, prefix, courts);

  console.log(`\n✅ ${prefix}: было ${knownBefore}, найдено ${courts.length}, запросов ${totalRequests}`);

  return { prefix, knownBefore, found: courts.length, requests: totalRequests };
}

/**
 * Углубление горячего блока: RRTTAB → RRTTAB0 … RRTTAB9.
 */
async function deepenBlock(
  client: ApiClient,
  prefix: string,
  block: string,
  courts: CourtData[],
): Promise<{ added: number; requests: number }> {
  let added = 0;
  let requests = 0;

  for (let d = 0; d <= 9; d++) {
    const query = prefix + block + d; // RRTTAB0 … RRTTAB9
    requests++;
    const resp = await client.suggestCourt(query, { count: 20 });
    const results = resp.suggestions.map(s => s.data);
    added += addNewCourts(courts, results);
  }

  return { added, requests };
}

function addNewCourts(storage: CourtData[], candidates: CourtData[]): number {
  let added = 0;
  const codes = new Set(storage.map(c => c.code));
  for (const c of candidates) {
    if (c.code && !codes.has(c.code)) {
      storage.push(c);
      codes.add(c.code);
      added++;
    }
  }
  return added;
}

function savePrefixData(dataDir: string, prefix: string, courts: CourtData[]): void {
  const dir = join(dataDir, 'prefixes');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${prefix}.json`), JSON.stringify(courts, null, 2), 'utf-8');
}
