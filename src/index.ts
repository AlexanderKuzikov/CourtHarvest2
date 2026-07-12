#!/usr/bin/env node
import './env.js';
import { Command } from 'commander';
import { join } from 'path';
import { KeyManager } from './core/KeyManager.js';
import { Registry } from './core/Registry.js';
import { runInventory } from './scanners/Inventory.js';
import { runSuperHard } from './scanners/SuperHard.js';
import { SINGLE_TYPES } from './types/dadata.js';

const KEYS_DIR = join(process.cwd(), 'keys');
const DATA_DIR = join(process.cwd(), 'data');

const program = new Command();

program
  .name('courtharvest2')
  .description('🌾 Сбор и поддержание справочника судов РФ через DaData API')
  .version('0.1.0');

// ── harvest ──────────────────────────────────────────────────
program
  .command('harvest')
  .description('Полный сбор с нуля: инвентаризация + SuperHard для MS/RS + остальные типы')
  .action(async () => {
    const km = new KeyManager();
    try {
      await km.init(KEYS_DIR);
    } catch (e: any) {
      console.error(`❌ ${e.message}`);
      process.exit(1);
    }

    const registry = new Registry(DATA_DIR);

    // Фаза 0: RRTT-инвентаризация
    await runInventory(km.getClient(), registry);
    const invStats = registry.getStats();
    console.log(`   → known: ${invStats.known}, empty: ${invStats.empty}, courts: ${invStats.totalCourts}`);

    // Фаза 1: SuperHard для MS/RS
    console.log('\n📦 Фаза 1: SuperHard для MS/RS');
    const shResult = await runSuperHard({ dataDir: DATA_DIR, keyManager: km, registry });
    console.log(`   → scanned: ${shResult.prefixesScanned} prefixes, ${shResult.totalCourts} courts`);
    await km.getClient().shutdown();

    // Фаза 2: Одиночные типы (OS, AS, GV, …)
    console.log('\n📦 Фаза 2: Одиночные типы');
    const singlePrefixes = Object.keys(registry.known).filter(p => {
      const type = p.slice(2, 4);
      return SINGLE_TYPES.includes(type as any);
    });

    // Создаём новый менеджер для фазы 2 (если ключи кончились)
    const km2 = new KeyManager();
    try {
      await km2.init(KEYS_DIR);
    } catch {
      console.log('⚠️  Нет доступных ключей для фазы 2. Можно запустить superhard позже.');
      return;
    }

    for (const prefix of singlePrefixes) {
      const client = km2.getClient();
      console.log(`  ${prefix}: запрос 1 суда`);
      const resp = await client.suggestCourt(`${prefix}0000`, { count: 1 });
      if (resp.suggestions.length > 0) {
        const court = resp.suggestions[0].data;
        registry.updateMeta(prefix, {
          count: 1, min: 0, max: 0, scanned: true,
        });
        console.log(`    ✅ ${court.code}: ${court.name}`);
      }
      await km2.trackRequest();
    }

    await km2.shutdown();

    const stats = registry.getStats();
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Итоги harvest:');
    console.log(`   Префиксов known:  ${stats.known}`);
    console.log(`   Префиксов empty:  ${stats.empty}`);
    console.log(`   Всего судов:      ${stats.totalCourts}`);
    console.log(`   Отсканировано:    ${stats.scanned}/${stats.known}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  });

// ── superhard ────────────────────────────────────────────────
program
  .command('superhard')
  .description('Тотальное сканирование MS/RS по 100 блокам')
  .option('-t, --types <types>', 'Типы через запятую (по умолчанию MS,RS)', 'MS,RS')
  .action(async () => {
    const km = new KeyManager();
    try {
      await km.init(KEYS_DIR);
    } catch (e: any) {
      console.error(`❌ ${e.message}`);
      process.exit(1);
    }

    const registry = new Registry(DATA_DIR);
    if (Object.keys(registry.known).length === 0) {
      console.error('❌ registry.json пуст. Сначала выполните harvest.');
      process.exit(1);
    }

    await runSuperHard({ dataDir: DATA_DIR, keyManager: km, registry });
    await km.shutdown();

    console.log(`\n💾 Данные сохранены в ${DATA_DIR}`);
  });

// ── stats ────────────────────────────────────────────────────
program
  .command('stats')
  .description('Показать статистику registry')
  .action(() => {
    const registry = new Registry(DATA_DIR);
    const stats = registry.getStats();
    console.log('\n📊 Registry stats:');
    console.log(`   Known prefixes:  ${stats.known}`);
    console.log(`   Empty prefixes:  ${stats.empty}`);
    console.log(`   Total courts:    ${stats.totalCourts}`);
    console.log(`   Scanned:         ${stats.scanned}/${stats.known}`);
    console.log('');

    if (stats.known > 0) {
      console.log('📋 Known prefixes:');
      for (const [prefix, meta] of Object.entries(registry.known)) {
        const scanned = meta.scanned ? '✅' : '⬜';
        console.log(`   ${scanned} ${prefix}: [${meta.min}..${meta.max}] = ${meta.count}`);
      }
    }
  });

program.parse();
