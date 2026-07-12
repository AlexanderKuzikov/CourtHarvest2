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
- [Структура кода судов](#-структура-кода-судов)
- [Ключи API и ротация](#-ключи-api-и-ротация)
- [Формат данных](#-формат-данных)
- [Технологический стек](#-технологический-стек)
- [Лицензия](#-лицензия)

---

## ✨ Возможности

| Возможность | Описание |
|-------------|----------|
| 🔍 **Harvest** | Первичный сбор с нуля: RRTT-инвентаризация + блочный перебор MS/RS + загрузка остальных типов |
| 🔄 **Refresh** | Ежемесячное обновление: хвосты, проверка новых префиксов, ревалидация |
| 🚀 **SuperHard** | Квартальный тотальный перебор MS/RS по 100 блоков — гарантированная полнота |
| 🔑 **Авто-ротация ключей** | До 4 API-ключей с автоматическим переключением при исчерпании лимита |
| ⏱ **Rate limiting** | Bottleneck + axios-retry для соблюдения ограничений DaData |
| 💾 **Чекпоинты** | Автосохранение прогресса, resume после падения |
| 📊 **Экспорт** | JSON + Excel |

---

## 🏗 Архитектура

```
┌───────────────────────────────────────────────────────┐
│                      CLI (commander)                   │
│              harvest | refresh | superhard             │
└───────────────────────┬───────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
┌───────────────────┐       ┌───────────────────────────┐
│   CodeSpaceScan    │       │     RegistryManager       │
│   RRTT-перебор     │       │  known / empty / MAX /    │
│   блочный поиск    │       │  timestamp / diff         │
│   tails / gaps     │       │                           │
└─────────┬──────────┘       └───────────┬───────────────┘
          │                               │
          ▼                               ▼
┌───────────────────────────────────────────────────────┐
│                    ApiClient                           │
│  DaData HTTP · Rate limiter · Retry · Key rotation     │
└───────────────────────┬───────────────────────────────┘
                        ▼
             ┌─────────────────────┐
             │  DaData API          │
             │  suggestions.dadata  │
             │  .ru                 │
             └─────────────────────┘
```

### Режимы обхода кодового пространства

```
Один префикс RRTT (например 01RS):
  01RS00 → 01RS01 → … → 01RS99    (100 запросов, до 20 судов в каждом)

SuperHard: MS + RS, все регионы
  99 регионов × 2 типа × 100 блоков = ~20 000 запросов (2 ключа)
```

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

```
Фаза 0: RRTT-инвентаризация  →  1 386 запросов
Фаза 1: SuperHard MS/RS      → 20 000 запросов
Фаза 2: Остальные типы       →  3 000 запросов
                               ─────────────────
                          ≈ 25 000 запросов (3 ключа)
```

Перебирает все 99×14 = 1 386 комбинаций `RRTT`, определяет существующие префиксы, затем блоками `RRTT00`–`RRTT99` загружает данные. MS/RS — полный перебор, остальные типы — одним запросом на префикс.

### 🔄 Refresh — ежемесячное обновление

```
Шаг A: tails — проверка хвостов для MS/RS     → ~5 000
Шаг B: новые префиксы (из пула empty)         →  1 000
Шаг C: ревалидация существующих (--full)      → 10 000
```

### 🚀 SuperHard — квартальное тотальное сканирование

Полный перебор MS/RS по 100 блокам на префикс:

```
99 регионов × 2 типа × 100 блоков = ~20 000 запросов (2 ключа)
```

Гарантированно находит любые суды, пропущенные штатным refresh из-за разреженной нумерации.

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

| Тип | Код | Приоритет SuperHard |
|:---:|:---:|:-------------------:|
| Мировой суд | **MS** | ✅ Да |
| Районный суд | **RS** | ✅ Да |
| Областной суд | OS | ❌ (1 на регион) |
| Арбитражный субъекта | AS | ❌ (1 на регион) |
| Верховный Суд | VS | ❌ (1 шт.) |
| Гарнизонный военный | GV | ❌ |
| Остальные | AA, AO, KJ, AJ, OV, KV, AV, AI | ❌ |

---

## 🔑 Ключи API и ротация

KeyRotationManager — автоматическая ротация:

```
keys/2.env          keys/3.env          keys/4.env
  0 – 9 500    →   9 501 – 19 000  →   19 001 – 28 500
```

- **Лимит на ключ:** 9 500 запросов (запас от дневного лимита 10 000)
- **Автопереключение:** без остановки процесса
- **Исчерпание:** корректное завершение с сохранением прогресса

---

## 📁 Формат данных

### registry.json

```json
{
  "version": "2.0",
  "updated": "2026-07-12T10:00:00Z",
  "known": {
    "01RS": { "min": 0, "max": 45, "count": 45, "status": "complete" },
    "01MS": { "min": 1, "max": 12, "count": 12, "status": "complete" },
    "01OS": { "min": 0, "max": 0, "count": 1, "status": "complete" }
  },
  "empty": ["01AI", "02AI", "02AO", "02AV", ...]
}
```

### courts.json

```json
{
  "meta": {
    "totalCourts": 10206,
    "timestamp": "2026-07-12T10:00:00Z"
  },
  "courts": [
    {
      "code": "01MS0001",
      "name": "Судебный участок № 1 ...",
      "region_code": "01",
      "okato": "...",
      "court_type": "MS",
      "address": "..."
    }
  ]
}
```

---

## 🧰 Технологический стек

| Технология | Назначение |
|------------|-----------|
| [TypeScript 7.0][ts] | Язык и типизация |
| [Node.js ≥ 24][node] | Среда выполнения |
| [axios][axios] + [axios-retry][retry] | HTTP-клиент с авто-повтором |
| [Bottleneck][bn] | Rate limiting (20 req/s) |
| [commander][commander] | CLI-интерфейс |
| [xlsx][xlsx] | Генерация Excel |
| [tsx][tsx] | Запуск TypeScript |
| [DaData API][dadata] | Источник данных |

---

## 📄 Лицензия

**Apache License 2.0** — см. [LICENSE](LICENSE).

---

## 👤 Автор

**Alexander Kuzikov**

[![GitHub](https://img.shields.io/badge/GitHub-AlexanderKuzikov-181717?logo=github)](https://github.com/AlexanderKuzikov)

---

<p align="center">
  <sub>v2 · Полная переработка Court-Harvester · 2026</sub>
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
