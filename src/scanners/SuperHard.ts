import { Registry } from '../core/Registry.js';
import { KeyManager } from '../core/KeyManager.js';
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
 * SuperHard — тотальное сканирование MS/RS префиксов.
 *
 * Проходит по всем known-префиксам типов MS и RS,
 * запускает для каждого блочный перебор RRTT00–99.
 *
 * 99 регионов × 2 типа ≈ 20 000 запросов = 2 ключа.
 */
export async function runSuperHard(opts: SuperHardOptions): Promise<SuperHardResult> {
  console.log('\n🚀 SuperHard: тотальное сканирование MS/RS\n');

  const heavyPrefixes = Object.entries(opts.registry.known)
    .filter(([prefix, meta]) => {
      const type = prefix.slice(2, 4) as string;
      return HEAVY_TYPES.includes(type as any) && !meta.scanned;
    })
    .map(([prefix]) => prefix)
    .sort();

  console.log(`📊 Префиксов для сканирования: ${heavyPrefixes.length}`);
  console.log(`📊 Из них MS: ${heavyPrefixes.filter(p => p.endsWith('MS')).length}`);
  console.log(`📊 Из них RS: ${heavyPrefixes.filter(p => p.endsWith('RS')).length}`);
  console.log(`📊 Оценка запросов: ~${heavyPrefixes.length * 100} (плюс углубление горячих)\n`);

  let totalRequests = 0;
  let totalCourts = 0;
  const results: ScanResult[] = [];

  for (let i = 0; i < heavyPrefixes.length; i++) {
    const prefix = heavyPrefixes[i];

    console.log(`\n[${i + 1}/${heavyPrefixes.length}]`);

    const getClient = () => opts.keyManager.getClient();
    const trackRequest = () => opts.keyManager.trackRequest();

    const result = await scanPrefix(getClient, opts.registry, prefix, {
      dataDir: opts.dataDir,
      trackRequest,
    });

    totalRequests += result.requests;
    totalCourts += result.found;
    results.push(result);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 SuperHard завершён');
  console.log(`📊 Префиксов: ${results.length}`);
  console.log(`📊 Всего судов: ${totalCourts}`);
  console.log(`📊 Запросов: ${totalRequests}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return { prefixesScanned: heavyPrefixes.length, totalCourts, totalRequests, results };
}
