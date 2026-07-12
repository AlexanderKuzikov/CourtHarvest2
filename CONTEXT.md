# CourtHarvest2 — CONTEXT

> **Архитектурные решения, обоснования и соглашения проекта.**
> Версия 2.0 — полная переработка Court-Harvester.
> Последнее обновление: Июль 2026

---

## 🎯 Назначение

**CourtHarvest2** — CLI-инструмент для сбора и поддержания эталонного справочника судов РФ через DaData API (suggestions.dadata.ru).

В отличие от v1, которая собиралась итеративно (9 фаз, алфавитный перебор, эвристики), v2 строится на точном знании структуры кодового пространства и гарантированном переборе.

---

## 📐 Ключевые принципы

### 1. Кодовое пространство конечно и известно

Все коды судов имеют формат `RRTTNNNN`:
- `RR` = регион (01–99)
- `TT` = тип суда (14 вариантов: RS, MS, OS, AS, GV, OV, KV, AV, KJ, AJ, AA, AO, VS, AI)
- `NNNN` = номер (0000–9999)

**1 386** возможных комбинаций RRTT. Из них ~396 существуют, остальные гарантированно пусты.

### 2. Полнота через простой перебор, не через умные эвристики

Вместо алфавитного поиска по названиям с maxDepth (v1) — **прямой перебор кодов блоками**.

Блок `RRTTAB` (2 цифры номера) = до 100 кодов. DaData возвращает ≤ 20 результатов. 100 кодов с ≤ 20 существующими судами — безопасно для всех типов, кроме самых плотных (MS в Москве). В горячих блоках (ровно 20) — углубление до 3 цифр.

### 3. MS и RS — единственные «тяжёлые» типы

Анализ собранной базы v1:

| Тип | Суда | Префиксов ~ | MAX (типичный) |
|-----|:----:|:-----------:|:--------------:|
| MS | 5 526 | 80 | 10–150 |
| RS | 1 937 | 85 | 5–50 |
| OS | 68 | 68 | 0 (один на регион) |
| AS | 81 | 81 | 0 |
| Остальные | ~300 | ~80 | 0–5 |

OS, AS, VS, GV и прочие — **1 суд на префикс**, номер = 0000. Их не нужно перебирать блоками, достаточно одного запроса `RRTT0000`.

### 4. SuperHard — единственный режим с гарантией

Обычный refresh (tails) может пропустить суды с разреженной нумерацией (дыра v1 — OS0000, 20 пустых = стоп). SuperHard перебирает всё кодовое пространство MS/RS по 100 блокам — никаких эвристик, никаких пропусков.

**Цена:** 20 000 запросов = 2 ключа = 1 день. Раз в квартал.

---

## 🗂 Режимы работы

### harvest — первичный сбор

Трёхфазный процесс в одной сессии KeyManager:

```
Фаза 0: RRTT-инвентаризация     →  1 386 запросов
Фаза 1: SuperHard MS/RS         → 20 000 запросов
Фаза 2: Одиночные типы (ост.)   →   ~300 запросов
                                  ─────────────────────
                             ≈ 22 000 запросов (2–3 ключа)
```

### superhard — тотальное сканирование

Для уже проинвентаризированной базы — перебор всех unscanned MS/RS префиксов.

### refresh — ежемесячное обновление

> **🧭 В режиме обсуждения.** Будет уточнён после реализации harvest и superhard и сверки с данными v1.

Вопросы к проектированию:
- Что делать при переезде суда? Обновлять адрес молча или сохранять историю?
- Как часто гонять полную ревалидацию? Каждый месяц или раз в полгода?
- Нужна ли команда `diff` для сравнения двух состояний базы?
- Автоматическое обнаружение переименований?

**План после beta:** реализовать и сверить с результатами v1.

---

## 🐛 Баги, найденные и исправленные при code review

### Баг 1: Нет трекинга запросов в сканерах

**Симптом:** Inventory и BlockScan делали запросы к DaData через `client.suggestCourt()`, но не сообщали KeyManager о том, что запрос сделан. KeyManager думал, что запросов нет, и никогда не переключал ключ. При превышении дневного лимита ApiClient выбрасывал `QuotaExceededError` (403), который не обрабатывался.

**Где:** `Inventory.ts:40`, `BlockScan.ts:48`, `BlockScan.ts:103`

**Фикс:** Внедрён `trackRequest`-колбэк, передаваемый из KeyManager. Вызов `await trackRequest()` — перед каждым `client.suggestCourt()`:

```ts
// Inventory.ts
if (trackRequest) await trackRequest();
const resp = await client.suggestCourt(prefix, { count: 1 });
```

```ts
// BlockScan.ts — scanPrefix и deepenBlock
totalRequests++;
if (options.trackRequest) await options.trackRequest();
const client = getClient();
const resp = await client.suggestCourt(query, { count: 20 });
```

### Баг 2: Старый ApiClient после ротации ключа

**Симптом:** При ротации ключа KeyManager.shutdown() вызывал stop() на текущем ApiClient и создавал новый. Но scanPrefix держал ссылку на старый `client: ApiClient` и продолжал делать запросы через убитый экземпляр.

**Где:** `SuperHard.ts → BlockScan.ts`

**Фикс:** Вместо готового `client: ApiClient` передаётся фабрика `getClient: () => ApiClient`. Перед каждым suggestCourt вызывается `getClient()`, который возвращает актуальный (возможно, только что созданный после ротации) экземпляр:

```ts
// SuperHard.ts
const getClient = () => opts.keyManager.getClient();
const trackRequest = () => opts.keyManager.trackRequest();

const result = await scanPrefix(getClient, opts.registry, prefix, {
  dataDir: opts.dataDir,
  trackRequest,
});
```

```ts
// BlockScan.ts
export async function scanPrefix(
  getClient: () => ApiClient,  // фабрика вместо готового экземпляра
  ...
) {
  ...
  const client = getClient();  // свежий под каждый запрос
  const resp = await client.suggestCourt(query, { count: 20 });
```

### Баг 3: Новый KeyManager для фазы 2 начинал с уже сожжённого ключа

**Симптом:** После завершения Phase 1 (SuperHard) код создавал `km2 = new KeyManager()`, который инициализировался с тех же ключей, но с нулевыми счётчиками. Ключ, который уже израсходовал 9 500 запросов в Phase 1, получал ещё ~500 запросов в Phase 2 (до лимита DaData 10 000), после чего падал с 403.

**Где:** `index.ts` — переход между фазами

**Фикс:** Фаза 2 работает на том же KeyManager (km), что и фаза 1. KeyManager помнит, сколько запросов сделано на каждом ключе, и корректно ротирует. Добавлен try/catch на случай, если все ключи исчерпаны:

```ts
// index.ts
await runSuperHard({ dataDir: DATA_DIR, keyManager: km, registry });

// Продолжаем той же сессией ключей
for (const prefix of singlePrefixes) {
  try {
    const client = km.getClient();
    ...
    await km.trackRequest();
  } catch (e: any) {
    break;  // ключи кончились — выходим
  }
}
await km.shutdown();  // безопасно — optional chaining
```

---

## 🧠 Известные уроки из v1

### Проблема OS0000

В v1 `getPrefixStats` возвращал `max = 0` для областных судов (код кончается на 0000). Tails начинали с MAX+1 = 1, а единственный существующий код — 0000. Результат: хвосты и дырки не работали для всего префикса.

**Решение v2:** инвентаризация находит префикс через probe. Для типов с max=0 не требуется tails — префикс закрыт одним запросом.

### Проблема 20 пустых подряд

v1 останавливала tails при 20 последовательных пустых ответах. Если реальные суды имели большие разрывы в нумерации (реорганизации, слияния участков), они терялись навсегда.

**Решение v2:** SuperHard с полным перебором по 100 блокам. Никаких эвристик остановки.

### Проблема дублирования фазовых скриптов

v1 имела 7 почти идентичных скриптов phase4–phase9b с дублированием `getPrefixStats`, `getAllPrefixes`, `main()`.

**Решение v2:** один унифицированный пайплайн с параметрами.

---

## 📁 Структура проекта

```
CourtHarvest2/
├── src/
│   ├── index.ts              CLI точка входа (harvest | superhard | stats)
│   ├── env.ts                Загрузка .env (0 зависимостей)
│   ├── core/
│   │   ├── ApiClient.ts      HTTP + rate limiter + retry + ошибки
│   │   ├── KeyManager.ts     Ротация ключей с трекингом запросов
│   │   └── Registry.ts       known/empty/scanned/timestamps
│   ├── scanners/
│   │   ├── Inventory.ts      RRTT-инвентаризация (99×14)
│   │   ├── BlockScan.ts      Блочный перебор (RRTT00–99) + углубление
│   │   └── SuperHard.ts      Оркестратор для MS/RS
│   └── types/
│       └── dadata.ts         Типы DaData API
├── keys/                     API-ключи (.env)
├── data/                     registry.json + prefixes/*.json
├── package.json
├── tsconfig.json
├── README.md
├── CONTEXT.md
└── LICENSE
```

---

## ⚙️ Технические решения

### Паттерн getClient / trackRequest

Ключевой архитектурный паттерн v2:

```
Перед каждым API-вызовом:
  1. trackRequest() — увеличить счётчик, при лимите → rotate (shutdown старого, create нового)
  2. getClient()    — получить актуальный (возможно, только что созданный) ApiClient
  3. suggestCourt() — выполнить HTTP-запрос к DaData
```

Это гарантирует, что:
- Ротация ключа происходит строго при исчерпании лимита, а не постфактум
- После ротации используется свежий клиент, а не shutdown-нутый старый
- При исчерпании всех ключей — исключение `getClient()` ловится try/catch

### Замена dotenv

Вместо `dotenv` — собственный загрузчик `src/env.ts` (~15 строк). Читает `.env` из рабочей директории, парсит key=value, устанавливает в `process.env`. Нуль зависимостей.

Node.js ≥ 24 также поддерживает флаг `--env-file` — можно запускать без env.ts совсем.

### Module Resolution: bundler

`tsconfig.json` использует `"moduleResolution": "bundler"` — оптимально для tsx. Не требует `.js`-суффиксов в импортах (но они оставлены для совместимости с ESM), корректно работает с ESM.

### TypeScript 7 + erasableSyntaxOnly

Флаг `erasableSyntaxOnly` запрещает декораторы и enum (они требуют трансформации, не поддерживаются tsx). Для CLI-утилиты ограничение несущественное.

### Нет eslint

`strict: true` + `noUnusedLocals` + `noUnusedParameters` + `noImplicitReturns` в tsconfig покрывают типичные проверки. Prettier — форматирование. eslint не нужен до появления стабильного `@typescript-eslint` под TS 7.

### Ключи на Windows

Проект работает на Windows через git-bash. `path.join`, `dirname`, `mkdirSync` корректно обрабатывают `\`-разделители. `readFileSync` читает `.env` файлы без BOM-заголовков.

---

## 🔗 Связанные проекты

| Проект | Связь |
|--------|-------|
| [Court-Harvester](https://github.com/AlexanderKuzikov/Court-Harvester) | v1 — предшественник |
| [Court-Viewer](https://github.com/AlexanderKuzikov/Court-Viewer) | UI для базы |
| [DocuMind](https://github.com/AlexanderKuzikov/DocuMind) | Документооборот — потребитель справочника |
