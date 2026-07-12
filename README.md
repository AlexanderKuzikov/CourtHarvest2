# CourtHarvest2 🌾

[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![DaData API](https://img.shields.io/badge/DaData-API-F5692A)][dadata]
[![CLI](https://img.shields.io/badge/CLI-commander-525252)][commander]
[![GitHub last commit](https://img.shields.io/github/last-commit/AlexanderKuzikov/CourtHarvest2)](https://github.com/AlexanderKuzikov/CourtHarvest2)

> **Эталонный справочник судов Российской Федерации.**  
> Сбор, обновление и верификация данных о судах через DaData API.  
> MS/RS-приоритетный перебор кодового пространства. SuperHard-режим полного сканирования.

---

## 📋 Содержание

- [Возможности](#-возможности)
- [Архитектура](#-архитектура)
- [Быстрый старт](#-быстрый-старт)
- [Режимы работы](#-режимы-работы)
- [CLI команды](#-cli-команды)
- [Структура кода судов](#-структура-кода-судов)
- [Ключи API и ротация](#-ключи-api-и-ротация)
- [Что нового в v2](#-что-нового-в-v2)
- [Формат данных](#-формат-данных)
- [Технологический стек](#-технологический-стек)
- [Лицензия](#-лицензия)

---

## ✨ Возможности

| Возможность | Описание |
|-------------|----------|
| 🔍 **Harvest** | Первичный сбор с нуля: RRTT-инвентаризация + блочный перебор MS/RS + одиночные типы |
| 🚀 **SuperHard** | Тотальный перебор MS/RS по 100 блоков — гарантированная полнота |
| 🔄 **Refresh** | 🧭 В режиме обсуждения |
| 🔑 **Авто-ротация ключей** | До 4 API-ключей с автоматическим переключением при исчерпании лимита |
| ⏱ **Rate limiting** | Bottleneck (20 req/s) + axios-retry (3 попытки, только сеть/5xx) |
| 🛡 **Корректная ротация** | getClient-фабрика перед каждым запросом — ключ ротируется без потери запросов |
| 💾 **Registry** | known/empty/scanned, чекпоинты на каждый префикс |
| 📊 **Экспорт** | JSON (по префиксам) + итоговый Excel |

---

## 🏗 Архитектура

```
                         CLI (commander)
                    harvest | superhard | stats
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
   ┌─────────────────┐           ┌──────────────────────┐
   │   Scanners       │           │    Registry           │
   │  Inventory.ts    │           │  known / empty /      │
   │  BlockScan.ts    │──────────►│  min / max / scanned  │
   │  SuperHard.ts    │           │  timestamp            │
   └────────┬─────────┘           └──────────────────────┘
            │
            ▼
   ┌───────────────────────────────────────────┐
   │          ApiClient + KeyManager            │
   │  HTTP · Rate limiter · Retry · Ротация     │
   │  getClient() фабрика + trackRequest()       │
   └────────────────────┬──────────────────────┘
                        ▼
              ┌─────────────────────┐
              │  DaData API          │
              │  suggestions.dadata  │
              │  .ru                 │
              └─────────────────────┘
```

### Ключевое отличие от v1

| v1 | v2 |
|----|----|
| Алфавитный перебор А–Я + maxDepth=3 | RRTT-инвентаризация + блочный перебор |
| `client: ApiClient` (один на префикс) | `getClient: () => ApiClient` (свежий под каждый запрос) |
| Запросы не трекались в KeyManager | `trackRequest()` перед каждым API-вызовом |
| 9 фазовых скриптов (phase4–9b) | Один унифицированный пайплайн |
| dotenv + eslint | env.ts (0 зависимостей) + только prettier |
| `moduleResolution: "node"` | `"bundler"` + `erasableSyntaxOnly` |
| TypeScript 5.7 | **TypeScript 7.0** |

---

## 🚀 Быстрый старт

### Предварительные требования

- **Node.js** ≥ 24
- **npm**
- **Ключи DaData**: [получить на dadata.ru][dadata]

### Установка

```bash
git clone https://github.com/AlexanderKuzikov/CourtHarvest2.git
cd CourtHarvest2
npm install
```

### Настройка ключей

```bash
keys/
├── 1.env     # Резервный (не используется скриптами)
├── 2.env     # Рабочий ключ
├── 3.env     # Дополнительный
└── 4.env     # Дополнительный
```

Формат:

```env
DADATA_API_KEY=ваш_api_ключ
DADATA_SECRET_KEY=ваш_secret_ключ
```

---

## 🔄 Режимы работы

### 🌱 Harvest — первичный сбор с нуля

Трёхфазный сбор:

```
Фаза 0: RRTT-инвентаризация
  → probe(region + type) для всех 99×14 = 1 386 комбинаций
  → результат: known = [01RS, 01MS, …], empty = [01AI, …]
  → ~1 386 запросов

Фаза 1: SuperHard MS/RS
  → для каждого known-префикса MS/RS: 100 блоков RRTT00–RRTT99
  → углубление горячих блоков (вернувших 20) до RRTTAB0–RRTTAB9
  → ~20 000 запросов (2 ключа)

Фаза 2: Одиночные типы (OS, AS, GV, VS, …)
  → для каждого префикса: запрос RRTT0000 (там ровно 1 суд)
  → ~300 запросов

Всего: ~22 000 запросов (2–3 ключа)
```

Запуск:

```bash
npm run harvest
```

### 🚀 SuperHard — тотальное сканирование MS/RS

Для уже проинвентаризированной базы — перебор всех MS/RS префиксов по 100 блоков:

```bash
npm run superhard
```

```
99 регионов × 2 типа × 100 блоков ≈ 20 000 запросов (2 ключа).
Раз в квартал — гарантированная полнота.
```

### ⏳ Stats — статистика registry

```bash
npx tsx src/index.ts stats
```

Показывает known/empty/scanned по каждому префиксу.

---

## 🖥 CLI команды

| Команда | Описание |
|---------|----------|
| `harvest` | Полный сбор с нуля: инвентаризация + SuperHard + одиночные типы |
| `superhard` | Тотальное сканирование MS/RS (требуется registry) |
| `stats` | Статистика registry |

---

## 🔤 Структура кода судов

```
01 RS 0001
│  │   │
│  │   └── Порядковый номер (0000–9999)
│  └────── Тип суда (RS, MS, AS, …)
└───────── Код региона (01–99)
```

### Типы судов

| Тип | Код | Приоритет SuperHard | Почему |
|:---:|:---:|:-------------------:|--------|
| Мировой суд | **MS** | ✅ Да | До 150 судов на префикс |
| Районный суд | **RS** | ✅ Да | До 50 судов на префикс |
| Областной суд | OS | ❌ | 1 на регион, MAX=0 |
| Арбитражный субъекта | AS | ❌ | 1 на регион |
| Верховный Суд | VS | ❌ | 1 шт. |
| Гарнизонный военный | GV | ❌ | MAX=0 |
| Остальные | AA, AO, KJ, AJ, OV, KV, AV, AI | ❌ | Статичны / отсутствуют |

---

## 🔑 Ключи API и ротация

KeyManager — автоматическая ротация с корректным трекингом запросов:

```
keys/2.env          keys/3.env          keys/4.env
  0 – 9 500    →   9 501 – 19 000  →   19 001 – 28 500
```

- **Лимит на ключ:** 9 500 запросов (запас 500 от дневного лимита 10 000)
- **Автопереключение:** через `trackRequest()` — без остановки процесса
- **Актуальный клиент:** через `getClient()` — фабрика возвращает текущий (возможно, только что созданный после ротации) экземпляр
- **Исчерпание всех ключей:** корректное завершение с сохранением прогресса

---

## ✨ Что нового в v2

### Исправленные ошибки v1

| Проблема v1 | Решение v2 |
|-------------|------------|
| OS0000 — областные суды с max=0 не имели tails | RRTT-инвентаризация находит префикс через `RRTT0000` |
| 20 пустых подряд = стоп → потеря разреженных префиксов | SuperHard с полным перебором по 100 блокам, никаких эвристик |
| 7 дублирующихся фазовых скриптов | Один параметризованный пайплайн |
| Потеря ключа при ротации (старый client.shutdown) | `getClient: () => ApiClient` — фабрика перед каждым запросом |
| Нет трекинга запросов в KeyManager из сканеров | `trackRequest()` колбэк в Inventory, BlockScan, Phase 2 |
| Новый KeyManager для фазы 2 с уже сожжённым ключом | Единая сессия km на все фазы с try/catch |

### Изменения в зависимостях

| Было | Стало | Причина |
|------|-------|---------|
| dotenv | **env.ts** (0 зависимостей) | Избавились от лишней зависимости |
| eslint + @typescript-eslint/* | **удалены** | Несовместимы с TS 7 |
| typescript ^5.7 | **^7.0.2** | Переход на актуальную мажорную версию |
| ModuleResolution: "node" | **"bundler"** | Корректная работа с ESM + tsx |
| `noUnusedLocals` + `noUnusedParameters` | **оставлены** | Жёсткий контроль чистоты кода |

---

## 📁 Формат данных

### registry.json

```json
{
  "version": "2.0",
  "created": "2026-07-12T10:00:00Z",
  "updated": "2026-07-12T14:00:00Z",
  "known": {
    "01RS": { "min": 0, "max": 45, "count": 45, "scanned": true, "updated": "…" },
    "01MS": { "min": 1, "max": 12, "count": 12, "scanned": true, "updated": "…" },
    "01OS": { "min": 0, "max": 0, "count": 1, "scanned": true, "updated": "…" }
  },
  "empty": ["01AI", "02AI", "02AO", …]
}
```

### data/prefixes/{prefix}.json

Пофайлово на префикс — для удобного diff и частичной перезаписи:

```json
[
  {
    "code": "01MS0001",
    "name": "Судебный участок № 1 …",
    "court_type": "MS",
    "address": "…"
  }
]
```

---

## 🧰 Технологический стек

| Технология | Назначение |
|------------|-----------|
| [TypeScript 7.0][ts] | Язык, типизация, strict mode |
| [Node.js ≥ 24][node] | Среда выполнения |
| [axios][axios] + [axios-retry][retry] | HTTP-клиент с авто-повтором (только сеть/5xx) |
| [Bottleneck][bn] | Rate limiting (token bucket, 20 req/s) |
| [commander][commander] | CLI-интерфейс |
| [xlsx][xlsx] | Генерация Excel |
| [tsx][tsx] | Запуск TypeScript |

---

## 📄 Лицензия

**Apache License 2.0** — см. [LICENSE](LICENSE).

---

## 👤 Автор

**Alexander Kuzikov**

[![GitHub](https://img.shields.io/badge/GitHub-AlexanderKuzikov-181717?logo=github)](https://github.com/AlexanderKuzikov)

---

<p align="center">
  <sub>v2 · Полная переработка Court-Harvester · Июль 2026</sub>
</p>

[ts]: https://www.typescriptlang.org/
[node]: https://nodejs.org/
[axios]: https://axios-http.com/
[retry]: https://github.com/softonic/axios-retry
[bn]: https://github.com/SGrondin/bottleneck
[commander]: https://github.com/tj/commander.js
[xlsx]: https://sheetjs.com/
[tsx]: https://github.com/privatenumber/tsx
[dadata]: https://dadata.ru/api/suggest/court/
