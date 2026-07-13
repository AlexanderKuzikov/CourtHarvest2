#!/usr/bin/env node
/**
 * Сборка финального courts.json из:
 *   - data/prefixes/          (новые MS/RS — приоритет)
 *   - data_20260712/prefixes/ (старые single-типы — fallback)
 *   - registry.json           (мета-информация)
 *
 * Запуск: npx tsx rebuild-courts.ts
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
const OLD_DIR = join(process.cwd(), 'data_20260712');
const PREFIXES_DIR = join(DATA_DIR, 'prefixes');
const OLD_PREFIXES_DIR = join(OLD_DIR, 'prefixes');

// Читаем registry, чтобы знать все префиксы
const registry = JSON.parse(readFileSync(join(DATA_DIR, 'registry.json'), 'utf-8'));
const knownPrefixes = Object.keys(registry.known).sort();

console.log(`📋 Префиксов в registry: ${knownPrefixes.length}`);

const allCourts: any[] = [];
let fromNew = 0;
let fromOld = 0;
let missing = 0;

for (const prefix of knownPrefixes) {
  // 1. Пробуем новый prefix-файл
  const newFile = join(PREFIXES_DIR, `${prefix}.json`);
  if (existsSync(newFile)) {
    const data = JSON.parse(readFileSync(newFile, 'utf-8'));
    allCourts.push(...data);
    fromNew += data.length;
    continue;
  }

  // 2. Пробуем старый prefix-файл
  const oldFile = join(OLD_PREFIXES_DIR, `${prefix}.json`);
  if (existsSync(oldFile)) {
    const data = JSON.parse(readFileSync(oldFile, 'utf-8'));
    allCourts.push(...data);
    fromOld += data.length;
    continue;
  }

  // 3. Нет нигде — считаем суды из registry.count (можно попробовать из старого courts.json)
  missing++;
}

console.log(`   Из новых prefix-файлов: ${fromNew} судов`);
console.log(`   Из старых prefix-файлов: ${fromOld} судов`);
if (missing > 0) console.log(`   ⚠️  Нет prefix-файлов для ${missing} префиксов — ищем в старом courts.json`);

// Если остались пропущенные — ищем в старом courts.json
if (missing > 0) {
  const oldCourtsData = JSON.parse(readFileSync(join(OLD_DIR, 'courts.json'), 'utf-8'));
  const oldCourts = oldCourtsData.courts || oldCourtsData;

  // Какие префиксы уже покрыты
  const coveredPrefixes = new Set<string>();
  const re = /^(\d{2}[A-Z]{2})/;
  for (const c of allCourts) {
    const m = c.code?.match(re);
    if (m) coveredPrefixes.add(m[1]);
  }

  let fromFallback = 0;
  for (const c of oldCourts) {
    const m = c.code?.match(re);
    if (m && !coveredPrefixes.has(m[1])) {
      allCourts.push(c);
      fromFallback++;
    }
  }
  console.log(`   Из старого courts.json (fallback): ${fromFallback} судов`);
}

// Сортируем по коду
allCourts.sort((a, b) => a.code?.localeCompare(b.code ?? '') ?? 0);

// Считаем по типам
const byType: Record<string, number> = {};
for (const c of allCourts) {
  const t = c.court_type || '?';
  byType[t] = (byType[t] || 0) + 1;
}

// Выводим статистику
console.log(`\n📊 Всего собрано: ${allCourts.length} судов`);
console.log('   По типам:');
for (const [t, n] of Object.entries(byType).sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`     ${t}: ${n}`);
}

// Сохраняем
const output = {
  meta: {
    totalCourts: allCourts.length,
    timestamp: new Date().toISOString(),
    phase: `harvest2-rebuild-${new Date().toISOString().slice(0, 10)}`,
    mode: 'rebuild',
  },
  courts: allCourts,
};

const outPath = join(DATA_DIR, 'courts.json');
writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
console.log(`\n✅ Сохранено: ${outPath}`);
