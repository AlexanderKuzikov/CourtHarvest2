#!/usr/bin/env node
import './env.js';
import { Command } from 'commander';
import { join } from 'path';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { KeyManager } from './core/KeyManager.js';
import { Registry } from './core/Registry.js';
import { ProgressTracker } from './core/ProgressTracker.js';
import { runInventory } from './scanners/Inventory.js';
import { runSuperHard } from './scanners/SuperHard.js';
import { SINGLE_TYPES } from './types/dadata.js';

const KEYS_DIR = join(process.cwd(), 'keys');
const DATA_DIR = join(process.cwd(), 'data');
const ASSEMBLED_PATH = join(DATA_DIR, 'courts.json');

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
    await runInventory(tracker, registry);
    const invStats = registry.getStats();
    console.log(`   known: ${invStats.known}, empty: ${invStats.empty}, courts: ${invStats.totalCourts}\n`);

    // ── Фаза 1: SuperHard MS/RS ──────────────────────────────
    await runSuperHard({ dataDir: DATA_DIR, tracker, registry });

    // ── Фаза 2: Одиночные типы ──────────────────────────────
    const singlePrefixes = Object.keys(registry.known).filter(p => {
      const type = p.slice(2, 4);
      return SINGLE_TYPES.includes(type as any) && !registry.known[p]?.scanned;
    });

    if (singlePrefixes.length > 0) {
      tracker.begin('Фаза 2: одиночные типы', singlePrefixes.length);

      for (const prefix of singlePrefixes) {
        process.stdout.write(`   ${prefix}: `);
        try {
          const client = tracker.getClient();
          const resp = await client.suggestCourt(prefix, { count: 20 });

          let found = 0;
          for (const s of resp.suggestions) {
            const court = s.data;
            if (court.code && court.code.startsWith(prefix)) {
              found++;
            }
          }

          if (found > 0) {
            registry.updateMeta(prefix, {
              count: found,
              scanned: true,
            });
            const codes = resp.suggestions
              .filter((s: any) => s.data.code?.startsWith(prefix))
              .map((s: any) => s.data.code)
              .join(', ');
            tracker.addFound(found);
            console.log(`✅ ${found} суд. (${codes})`);
          } else {
            console.log(`· пусто`);
          }

          await tracker.trackRequest();
        } catch (e: any) {
          console.log(`⚠️  ${e.message}`);
          break;
        }
        tracker.tick();
      }

      tracker.end();
    }

    // ── Фаза 3: Сборка courts.json ───────────────────────────
    tracker.log('📦 Сборка финального courts.json…');

    const allCourts: any[] = [];
    const prefixes = Object.keys(registry.known);
    for (const prefix of prefixes) {
      const pfile = join(DATA_DIR, 'prefixes', `${prefix}.json`);
      if (existsSync(pfile)) {
        const data = JSON.parse(readFileSync(pfile, 'utf-8'));
        allCourts.push(...data);
      }
    }

    allCourts.sort((a, b) => a.code?.localeCompare(b.code ?? '') ?? 0);

    const output = {
      meta: {
        totalCourts: allCourts.length,
        timestamp: new Date().toISOString(),
        phase: `harvest2-${new Date().toISOString().slice(0, 10)}`,
        mode: 'full',
      },
      courts: allCourts,
    };

    writeFileSync(ASSEMBLED_PATH, JSON.stringify(output, null, 2), 'utf-8');

    // ── Итоги ────────────────────────────────────────────────
    await km.shutdown();

    const final = registry.getStats();
    const totalTime = tracker.fmt(tracker.elapsed());

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 ИТОГИ HARVEST');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   ⏱  Время:               ${totalTime}`);
    console.log(`   🏛  Судей в courts.json:  ${allCourts.length}`);
    console.log(`   📋  Префиксов known:     ${final.known}`);
    console.log(`   🔳  Префиксов empty:     ${final.empty}`);
    console.log(`   ✅  Отсканировано:       ${final.scanned}/${final.known}`);
    console.log(`   💳  ${tracker.statusLine()}`);
    console.log(`   📁  ${ASSEMBLED_PATH}`);
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

    const tracker = new ProgressTracker(km);
    const registry = new Registry(DATA_DIR);
    if (Object.keys(registry.known).length === 0) {
      console.error('❌ registry.json пуст. Сначала выполните harvest.');
      process.exit(1);
    }

    await runSuperHard({ dataDir: DATA_DIR, tracker, registry });
    await km.shutdown();
    tracker.log(`💾 Данные в ${DATA_DIR}\n`);
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
