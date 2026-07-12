import { Registry } from '../core/Registry.js';
import { KeyManager } from '../core/KeyManager.js';
import { ProgressTracker } from '../core/ProgressTracker.js';
import { HEAVY_TYPES } from '../types/dadata.js';
import { scanPrefix, ScanResult } from './BlockScan.js';

export interface SuperHardOptions {
  dataDir: string;
  keyManager: KeyManager;
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
 */
export async function runSuperHard(opts: SuperHardOptions): Promise<SuperHardResult> {
  const tracker = new ProgressTracker(opts.keyManager);

  const heavyPrefixes = Object.entries(opts.registry.known)
    .filter(([prefix, meta]) => {
      const type = prefix.slice(2, 4) as string;
      return HEAVY_TYPES.includes(type as any) && !meta.scanned;
    })
    .map(([prefix]) => prefix)
    .sort();

  if (heavyPrefixes.length === 0) {
    console.log('\n🚀 SuperHard: все MS/RS префиксы уже отсканированы.\n');
    return { prefixesScanned: 0, totalCourts: 0, totalRequests: 0, results: [] };
  }

  tracker.begin(`SuperHard MS/RS — ${heavyPrefixes.length} префиксов`, heavyPrefixes.length);

  let totalRequests = 0;
  let totalCourts = 0;
  const results: ScanResult[] = [];

  for (let i = 0; i < heavyPrefixes.length; i++) {
    const prefix = heavyPrefixes[i];
    const timeStart = Date.now();

    const result = await scanPrefix(tracker, prefix, opts.dataDir);

    // Обновляем registry
    opts.registry.updateMeta(prefix, {
      count: result.found,
      scanned: true,
    });

    const elapsed = ((Date.now() - timeStart) / 1000).toFixed(0);
    const eta = tracker.eta() || '—';

    totalRequests += result.requests;
    totalCourts += result.found;
    results.push(result);

    console.log(
      `✅ ${prefix}: ${result.found} суд. · ${result.requests} запр. · ${elapsed}с` +
      ` · всего: ${totalCourts} суд. · ${tracker.statusLine()}` +
      ` · ETA: ${eta}\n`
    );

    tracker.tick();
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  tracker.end();
  console.log(`📊 префиксов: ${results.length}`);
  console.log(`📊 судов: ${totalCourts} · запросов: ${totalRequests}`);
  console.log(`📊 ${tracker.statusLine()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return { prefixesScanned: heavyPrefixes.length, totalCourts, totalRequests, results };
}
