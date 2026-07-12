import './env.js';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { KeyManager } from './core/KeyManager.js';
import { ProgressTracker } from './core/ProgressTracker.js';
import { Registry } from './core/Registry.js';

const KEYS_DIR = join(process.cwd(), 'keys');
const DATA_DIR = join(process.cwd(), 'data');

async function main() {
  const km = new KeyManager();
  try {
    await km.init(KEYS_DIR);
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
    console.log('✅ Все префиксы уже отсканированы.');
    await km.shutdown();
    return;
  }

  console.log(`📋 Неотсканированных префиксов: ${unscanned.length}\n`);
  tracker.begin('fill', unscanned.length);

  let totalFound = 0;

  for (const prefix of unscanned) {
    process.stdout.write(`   ${prefix}: `);
    try {
      const client = tracker.getClient();
      const resp = await client.suggestCourt(prefix, { count: 20 });

      const courts = resp.suggestions
        .filter((s: any) => s.data.code?.startsWith(prefix))
        .map((s: any) => s.data);

      if (courts.length > 0) {
        // Сохраняем
        const dir = join(DATA_DIR, 'prefixes');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${prefix}.json`), JSON.stringify(courts, null, 2), 'utf-8');

        registry.updateMeta(prefix, { count: courts.length, scanned: true });
        tracker.addFound(courts.length);
        totalFound += courts.length;
        console.log(`✅ ${courts.length} суд.`);
      } else {
        registry.updateMeta(prefix, { count: 0, scanned: true });
        console.log(`· пусто`);
      }

      await tracker.trackRequest();
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

main().catch(console.error);
