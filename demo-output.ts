#!/usr/bin/env node
/**
 * Демо-режим: имитация хода работы CourtHarvest2 с новым выводом.
 * Не делает API-запросов — только визуализация.
 *
 * Запуск: npx tsx demo-output.ts
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

function fmt(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  if (hr > 0) return `${hr}ч ${min % 60}м ${sec % 60}с`;
  if (min > 0) return `${min}м ${sec % 60}с`;
  return `${sec}с`;
}

function elapsed(start: number): string {
  return fmt(Date.now() - start);
}

function eta(done: number, total: number, start: number): string | null {
  if (done === 0) return null;
  const perItem = (Date.now() - start) / done;
  const remaining = Math.round(perItem * (total - done));
  return fmt(remaining);
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function Demo() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  ДЕМО-РЕЖИМ: CourtHarvest2 — новый вывод');
  console.log('  Реальные запросы не выполняются\n');

  // ── Фаза 0: инвентаризация ─────────────────────────────
  console.log('────────────────────────────────────────────────────');
  console.log('  ФАЗА 0: RRTT-инвентаризация (имитация 5с)');
  console.log('────────────────────────────────────────────────────\n');

  const TOTAL0 = 1400;
  const start0 = Date.now();
  let known = 0;

  for (let done = 0; done <= TOTAL0; done += 50) {
    known = Math.round(done * 0.34); // ~34% known
    const empty = done - known;
    const pct = ((done / TOTAL0) * 100).toFixed(0);
    const eta0 = eta(done, TOTAL0, start0);
    const etaStr = eta0 ? ` · ETA ${eta0}` : '';
    process.stdout.write(
      `\r   [${String(done).padStart(4)}/${TOTAL0}] known: ${known}, empty: ${empty} · ${pct}%${etaStr}`
    );
    if (done < TOTAL0) await sleep(180);
  }

  const elapsed0 = fmt(Date.now() - start0);
  process.stdout.write(`\n`);
  console.log(`   ✅ Фаза 0: RRTT-инвентаризация · 1400/1400 · ${elapsed0}`);
  console.log(`   💳 2.env (1400/9500)\n`);

  // ── Фаза 1: SuperHard MS/RS ─────────────────────────────
  console.log('────────────────────────────────────────────────────');
  console.log('  ФАЗА 1: SuperHard MS/RS (имитация 10с)');
  console.log('────────────────────────────────────────────────────\n');

  const start1 = Date.now();
  const prefixes = [
    { pfx: '01MS', found: 24, req: 110 },
    { pfx: '01RS', found: 8, req: 100 },
    { pfx: '02MS', found: 14, req: 100 },
    { pfx: '02RS', found: 11, req: 100 },
    { pfx: '03MS', found: 215, req: 120 },
    { pfx: '03RS', found: 45, req: 110 },
    { pfx: '04MS', found: 54, req: 110 },
    { pfx: '04RS', found: 21, req: 100 },
    { pfx: '05MS', found: 131, req: 110 },
    { pfx: '05RS', found: 41, req: 100 },
    { pfx: '06MS', found: 23, req: 100 },
    { pfx: '06RS', found: 6, req: 100 },
    { pfx: '07MS', found: 50, req: 100 },
    { pfx: '07RS', found: 10, req: 100 },
    { pfx: '08MS', found: 19, req: 100 },
    { pfx: '08RS', found: 11, req: 100 },
    { pfx: '09MS', found: 26, req: 100 },
    { pfx: '09RS', found: 10, req: 100 },
    { pfx: '10MS', found: 38, req: 100 },
    { pfx: '10RS', found: 17, req: 100 },
  ];

  let totalCourts1 = 0;
  for (let i = 0; i < prefixes.length; i++) {
    const p = prefixes[i];
    const t0 = Date.now();
    await sleep(250 + Math.random() * 150);

    totalCourts1 += p.found;
    const dur = ((Date.now() - t0) / 1000).toFixed(0);
    const idx = `[${String(i + 1).padStart(3)}/${String(prefixes.length).padStart(3)}]`;
    const eta1 = eta(i + 1, prefixes.length, start1);
    const etaStr1 = eta1 ? ` · ETA: ${eta1}` : '';
    console.log(
      `   ${idx} ${p.pfx}  →  ${String(p.found).padStart(4)} суд.  ·  ${String(p.req).padStart(3)} запр.  ·  ${dur}с${etaStr1}`
    );
  }

  console.log(`\n   ✅ SuperHard MS/RS · ${prefixes.length}/${prefixes.length} · ${fmt(Date.now() - start1)}`);
  console.log(`   💳 2.env (3500/9500)\n`);

  // ── Фаза 2: одиночные типы ─────────────────────────────
  console.log('────────────────────────────────────────────────────');
  console.log('  ФАЗА 2: одиночные типы (имитация 3с)');
  console.log('────────────────────────────────────────────────────\n');

  const start2 = Date.now();
  const singleTypes = [
    { type: 'AS', count: 83, regions: 82 },
    { type: 'OS', count: 89, regions: 88 },
    { type: 'GV', count: 104, regions: 28 },
    { type: 'VS', count: 1, regions: 1 },
    { type: 'KJ', count: 9, regions: 9 },
    { type: 'AJ', count: 5, regions: 5 },
    { type: 'AA', count: 21, regions: 21 },
    { type: 'AO', count: 10, regions: 10 },
    { type: 'OV', count: 9, regions: 8 },
    { type: 'AV', count: 1, regions: 1 },
    { type: 'KV', count: 1, regions: 1 },
  ];
  const totalSingle = singleTypes.reduce((s, t) => s + t.regions, 0);

  console.log(`   [${totalSingle}/${totalSingle}] (тихо — без поминутного вывода)`);
  console.log(`   ✅ Фаза 2: одиночные типы · ${totalSingle}/${totalSingle} · ${fmt(Date.now() - start2 + 3000)}`);
  const byTypeParts = singleTypes
    .filter(t => t.count > 0)
    .map(t => `${t.type}: ${t.count}`);
  console.log(`   📋 Одиночные типы: ${byTypeParts.join(', ')}\n`);

  // ── Итоговый отчёт ─────────────────────────────────────
  console.log('────────────────────────────────────────────────────');
  console.log('  ИТОГОВЫЙ ОТЧЁТ');
  console.log('────────────────────────────────────────────────────\n');

  const totalTime = fmt(29000 + 2000);
  const allCourts = [
    { type: 'MS', count: 7744 },
    { type: 'RS', count: 2148 },
    ...singleTypes,
  ];
  const totalCourts = allCourts.reduce((s, t) => s + t.count, 0);
  const maxTypeLen = Math.max(...allCourts.map(t => t.type.length), 4);

  const reportLines: string[] = [];
  function rl(line = '') { reportLines.push(line); }

  rl('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  rl('📊  ИТОГИ HARVEST');
  rl('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  rl(`  ⏱  Общее время:         ${totalTime}`);
  rl('');
  rl('  📋  Префиксы');
  rl(`       known:   479   empty:  921`);
  rl(`       scanned: 479/479 (100.0%)`);
  rl('');
  rl('  🏛  Судей по типам');
  for (const t of allCourts) {
    rl(`       ${t.type.padEnd(maxTypeLen)} ${String(t.count).padStart(6)}`);
  }
  rl(`       ${''.padEnd(maxTypeLen)} ───────`);
  rl(`       ${'ВСЕГО'.padEnd(maxTypeLen)} ${String(totalCourts).padStart(6)}`);
  rl('');
  rl('  💳  Ключи: 2.env, 3.env (9500/9500), 4.env (2200/9500)');
  rl('  📁  D:\\GitHub\\CourtHarvest2\\data\\courts.json');
  rl('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log(reportLines.join('\n'));

  // Сохраняем демо-лог
  const logDir = join(process.cwd(), 'data', 'logs');
  mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, 'DEMO_output.log');
  writeFileSync(logFile, reportLines.join('\n'), 'utf-8');
  console.log(`   📄 Лог: ${logFile}\n`);

  console.log('══════════════════════════════════════════════════');
  console.log('  Демо завершено. Реальных запросов не было.');
  console.log('  Теперь `npm run harvest` будет выглядеть так же.\n');
}

Demo().catch(console.error);
