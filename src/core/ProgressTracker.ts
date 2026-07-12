import { ApiClient } from './ApiClient.js';
import { KeyManager } from './KeyManager.js';

/**
 * Прогресс-трекер: время, запросы, ключи, ETA.
 * Пробрасывается через всю цепочку — Inventory → SuperHard → BlockScan.
 *
 * Использование:
 *   tracker.begin('Фаза', total)  — старт
 *   tracker.tick()                 — одна единица работы (тихо)
 *   tracker.log(msg)               — явный лог с таймстампом
 *   tracker.end()                  — финиш
 *   tracker.statusLine()           — компактная строка состояния
 */
export class ProgressTracker {
  private km: KeyManager;
  private startTime: number;
  private phaseStartTime: number;
  private phaseName = '';
  private phaseTotal = 0;
  private phaseDone = 0;
  private globalRequests = 0;
  private globalFound = 0;

  constructor(km: KeyManager) {
    this.km = km;
    this.startTime = Date.now();
    this.phaseStartTime = Date.now();
  }

  // ── Управление фазами ────────────────────────────────────────

  begin(name: string, total: number): void {
    this.phaseName = name;
    this.phaseTotal = total;
    this.phaseDone = 0;
    this.phaseStartTime = Date.now();
    this.log(`🚀 ${name} (${total})`);
  }

  end(): void {
    const elapsed = this.fmt(this.phaseElapsed());
    this.log(`✅ ${this.phaseName} · ${this.phaseDone}/${this.phaseTotal} · ${elapsed}`);
  }

  /** Одна единица работы — тихо, без вывода */
  tick(n = 1): void {
    this.phaseDone += n;
  }

  // ── Проброс в KeyManager ─────────────────────────────────────

  trackRequest(): Promise<boolean> {
    this.globalRequests++;
    return this.km.trackRequest();
  }

  getClient(): ApiClient {
    return this.km.getClient();
  }

  // ── Счётчики ─────────────────────────────────────────────────

  addFound(n: number): void {
    this.globalFound += n;
  }

  get stats() {
    return {
      requests: this.globalRequests,
      found: this.globalFound,
      elapsed: this.elapsed(),
      phaseElapsed: this.phaseElapsed(),
      eta: this.eta(),
      keyInfo: this.keyInfo(),
    };
  }

  // ── Форматирование ───────────────────────────────────────────

  /** Компактная строка: ⏱ время · 💳 ключ · 📊 суды · 📡 запросы */
  statusLine(): string {
    return [
      `⏱ ${this.fmt(this.elapsed())}`,
      `💳 ${this.keyInfo()}`,
      `📊 ${this.globalFound} суд.`,
      `📡 ${this.globalRequests} запр.`,
    ].join(' · ');
  }

  /** Строка прогресса фазы */
  progressLine(): string {
    if (this.phaseTotal === 0) return this.statusLine();
    const pct = ((this.phaseDone / this.phaseTotal) * 100).toFixed(1);
    const eta = this.eta() ? ` · ETA: ${this.eta()}` : '';
    return `${this.phaseDone}/${this.phaseTotal} (${pct}%)${eta} · ${this.statusLine()}`;
  }

  /** ETA относительно текущей фазы */
  eta(): string | null {
    if (this.phaseDone === 0 || this.phaseTotal === 0) return null;
    const perItem = this.phaseElapsed() / this.phaseDone;
    const remaining = Math.round(perItem * (this.phaseTotal - this.phaseDone));
    return this.fmt(remaining);
  }

  /** Общее время от старта (ms) */
  elapsed(): number {
    return Date.now() - this.startTime;
  }

  /** Время текущей фазы (ms) */
  phaseElapsed(): number {
    return Date.now() - this.phaseStartTime;
  }

  /** Информация о ключе */
  keyInfo(): string {
    const s = this.km.getStats();
    const limit = (this.km as any)['limitPerKey'] ?? 9500;
    return `${s.currentKey} (${s.currentKeyRequests}/${limit})`;
  }

  /** Лог с таймстампом [HH:MM:SS] */
  log(msg: string): void {
    const ts = new Date().toLocaleTimeString('ru-RU', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    console.log(`[${ts}] ${msg}`);
  }

  /** Форматирование ms в человекопонятный вид */
  fmt(ms: number): string {
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    if (hr > 0) return `${hr}ч ${min % 60}м ${sec % 60}с`;
    if (min > 0) return `${min}м ${sec % 60}с`;
    return `${sec}с`;
  }
}
