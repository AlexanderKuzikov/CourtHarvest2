#!/usr/bin/env node
import './env.js';
import { Command } from 'commander';
import { join } from 'path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
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

      const foundByType: Record<string, number> = {};

      for (const prefix of singlePrefixes) {
        try {
          await tracker.trackRequest();
          const client = tracker.getClient();
          const resp = await client.suggestCourt(prefix, { count: 20 });

          const courts = resp.suggestions
            .map((s: any) => s.data)
            .filter((d: any) => d.code && d.code.startsWith(prefix));

          const found = courts.length;
          tracker.addFound(found);

          // Сохраняем prefix-файл (даже пустой — чтобы courts.json знал, что проверено)
          const pDir = join(DATA_DIR, 'prefixes');
          mkdirSync(pDir, { recursive: true });
          writeFileSync(join(pDir, `${prefix}.json`), JSON.stringify(courts, null, 2));

          registry.updateMeta(prefix, {
            count: found,
            scanned: true,
          });

          const type = prefix.slice(2, 4);
          foundByType[type] = (foundByType[type] || 0) + found;
        } catch (e: any) {
          tracker.log(`⚠️  ${prefix}: ${e.message}`);
          break;
        }
        tracker.tick();
      }

      tracker.end();
      // Итоговая строка по типам
      const byTypeStr = Object.entries(foundByType)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([t, n]) => `${t}: ${n}`)
        .join(', ');
      tracker.log(`📋 Одиночные типы: ${byTypeStr}`);
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

    // Считаем суды по типам
    const byType: Record<string, number> = {};
    for (const c of allCourts) {
      const t = c.court_type || '?';
      byType[t] = (byType[t] || 0) + 1;
    }
    const typeEntries = Object.entries(byType).sort(([a], [b]) => a.localeCompare(b));
    const maxTypeCol = Math.max(...typeEntries.map(([t]) => t.length), 2) + 2;

    // Формируем блок вывода (и для консоли, и для лога)
    const reportLines: string[] = [];

    function rl(line = '') { reportLines.push(line); }

    rl('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    rl('📊  ИТОГИ HARVEST');
    rl('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    rl(`  ⏱  Общее время:         ${totalTime}`);
    rl('');
    rl('  📋  Префиксы');
    rl(`       known:  ${String(final.known).padStart(4)}   empty:  ${String(final.empty).padStart(4)}`);
    const scanPct = final.known > 0 ? ((final.scanned / final.known) * 100).toFixed(1) : '0.0';
    rl(`       scanned: ${final.scanned}/${final.known} (${scanPct}%)`);
    rl('');
    rl('  🏛  Судей по типам');
    for (const [type, count] of typeEntries) {
      rl(`       ${type.padEnd(maxTypeCol)} ${String(count).padStart(6)}`);
    }
    rl(`       ${''.padEnd(maxTypeCol)} ───────`);
    rl(`       ${'ВСЕГО'.padEnd(maxTypeCol)} ${String(allCourts.length).padStart(6)}`);
    rl('');
    rl(`  💳  Ключи: ${tracker.keyInfo()}`);
    rl(`  📁  ${ASSEMBLED_PATH}`);
    rl('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Вывод в консоль
    console.log('\n' + reportLines.join('\n') + '\n');

    // Сохранение в лог-файл
    const logDir = join(process.cwd(), 'data', 'logs');
    mkdirSync(logDir, { recursive: true });
    const logFile = join(logDir, `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.log`);
    writeFileSync(logFile, reportLines.join('\n'), 'utf-8');
    console.log(`   📄 Лог: ${logFile}\n`);
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
