import { Registry } from '../core/Registry.js';
import { ProgressTracker } from '../core/ProgressTracker.js';
import { HEAVY_TYPES } from '../types/dadata.js';
import { scanPrefix, ScanResult } from './BlockScan.js';

export interface SuperHardOptions {
  dataDir: string;
  tracker: ProgressTracker;
  registry: Registry;
}

export interface SuperHardResult {
  prefixesScanned: number;
  totalCourts: number;
  totalRequests: number;
  results: ScanResult[];
}

/**
 * SuperHard — тотальное сканирование MS/RS.
 * Каждый префикс — 100 блоков RRTT00–99.
 * Использует переданный tracker (без создания своего).
 */
export async function runSuperHard(opts: SuperHardOptions): Promise<SuperHardResult> {
  const heavyPrefixes = Object.entries(opts.registry.known)
    .filter(([prefix, meta]) => {
      const type = prefix.slice(2, 4);
      return HEAVY_TYPES.includes(type as any) && !meta.scanned;
    })
    .map(([prefix]) => prefix)
    .sort();

  if (heavyPrefixes.length === 0) {
    opts.tracker.log('🚀 SuperHard: все MS/RS уже отсканированы');
    return { prefixesScanned: 0, totalCourts: 0, totalRequests: 0, results: [] };
  }

  opts.tracker.begin(
    `SuperHard MS/RS (${heavyPrefixes.length} префиксов)`,
    heavyPrefixes.length,
  );

  let totalRequests = 0;
  let totalCourts = 0;
  const results: ScanResult[] = [];

  for (let i = 0; i < heavyPrefixes.length; i++) {
    const prefix = heavyPrefixes[i];
    const t0 = Date.now();

    // Показываем бар сканирования
    process.stdout.write(`[${i + 1}/${heavyPrefixes.length}] ${prefix}  `);

    const result = await scanPrefix(opts.tracker, prefix, opts.dataDir);

    // Обновляем registry
    opts.registry.updateMeta(prefix, {
      count: result.found,
      scanned: true,
    });

    totalRequests += result.requests;
    totalCourts += result.found;
    results.push(result);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    opts.tracker.log(
      `${prefix}: ${result.found} суд. · ${result.requests} запр. · ${elapsed}с · всего: ${totalCourts} суд. · ${opts.tracker.progressLine()}`
    );

    opts.tracker.tick();
  }

  opts.tracker.end();

  return { prefixesScanned: heavyPrefixes.length, totalCourts, totalRequests, results };
}
