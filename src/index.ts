#!/usr/bin/env node
import './env.js';
import { Command } from 'commander';
import { join } from 'path';
import { KeyManager } from './core/KeyManager.js';
import { Registry } from './core/Registry.js';
import { ProgressTracker } from './core/ProgressTracker.js';
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
  .description('Полный сбор с нуля: инвентаризация + SuperHard + одиночные типы')
  .action(async () => {
    const km = new KeyManager();
    try {
      await km.init(KEYS_DIR);
    } catch (e: any) {
      console.error(`❌ ${e.message}`);
      process.exit(1);
    }

    const tracker = new ProgressTracker(km);
    const registry = new Registry(DATA_DIR);

    console.log(`🌾 CourtHarvest2 · ${new Date().toLocaleString('ru-RU')}\n`);

    // ── Фаза 0: RRTT-инвентаризация ──────────────────────────
    const invTimer = Date.now();
    await runInventory(tracker, registry);
    const invStats = registry.getStats();
    console.log(`   known: ${invStats.known}, empty: ${invStats.empty}, courts: ${invStats.totalCourts}\n`);

    // ── Фаза 1: SuperHard MS/RS ──────────────────────────────
    await runSuperHard({ dataDir: DATA_DIR, keyManager: km, registry });

    // ── Фаза 2: Одиночные типы ──────────────────────────────
    const singlePrefixes = Object.keys(registry.known).filter(p => {
      const type = p.slice(2, 4);
      return SINGLE_TYPES.includes(type as any);
    });

    if (singlePrefixes.length > 0) {
      tracker.begin('Фаза 2: одиночные типы', singlePrefixes.length);

      for (const prefix of singlePrefixes) {
        try {
          const client = tracker.getClient();
          const resp = await client.suggestCourt(`${prefix}0000`, { count: 1 });
          if (resp.suggestions.length > 0) {
            const court = resp.suggestions[0].data;
            registry.updateMeta(prefix, {
              count: 1, min: 0, max: 0, scanned: true,
            });
            tracker.addFound(1);
            console.log(`   ✅ ${court.code}: ${court.name}`);
          }
          await tracker.trackRequest();
        } catch (e: any) {
          console.log(`   ⚠️  ${prefix}: ${e.message} — остальные пропущены`);
          break;
        }
        tracker.tick();
      }

      tracker.end();
    }

    // ── Итоги ────────────────────────────────────────────────
    await km.shutdown();

    const final = registry.getStats();
    const totalTime = ((Date.now() - invTimer) / 1000 / 60).toFixed(1);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 ИТОГИ HARVEST');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   ⏱  Общее время:         ${totalTime} мин`);
    console.log(`   🏛  Всего судов:          ${final.totalCourts}`);
    console.log(`   📋 Префиксов known:      ${final.known}`);
    console.log(`   🔳 Префиксов empty:      ${final.empty}`);
    console.log(`   ✅ Отсканировано:        ${final.scanned}/${final.known}`);
    console.log(`   💳 ${tracker.statusLine()}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  });

// ── superhard ────────────────────────────────────────────────
program
  .command('superhard')
  .description('Тотальное сканирование MS/RS по 100 блокам')
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
    console.log(`💾 Данные сохранены в ${DATA_DIR}\n`);
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
    console.log(`   Scanned:         ${stats.scanned}/${stats.known}\n`);

    if (stats.known > 0) {
      console.log('📋 Known prefixes:');
      for (const [prefix, meta] of Object.entries(registry.known)) {
        const scanned = meta.scanned ? '✅' : '⬜';
        console.log(`   ${scanned} ${prefix}: [${meta.min}..${meta.max}] = ${meta.count}`);
      }
    }
  });

program.parse();
