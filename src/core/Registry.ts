import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

export interface PrefixMeta {
  min: number;
  max: number;
  count: number;
  scanned: boolean;    // true = блоки RRTT00–99 пройдены
  updated: string;     // ISO timestamp
}

export interface RegistryData {
  version: string;
  created: string;
  updated: string;
  known: Record<string, PrefixMeta>;
  empty: string[];     // RRTT-префиксы без судов
}

export class Registry {
  private data: RegistryData;
  private path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, 'registry.json');
    if (existsSync(this.path)) {
      this.data = JSON.parse(readFileSync(this.path, 'utf-8'));
    } else {
      this.data = {
        version: '2.0',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        known: {},
        empty: [],
      };
    }
  }

  get known(): Record<string, PrefixMeta> {
    return this.data.known;
  }

  get empty(): string[] {
    return this.data.empty;
  }

  hasPrefix(prefix: string): boolean {
    return prefix in this.data.known || this.data.empty.includes(prefix);
  }

  isKnown(prefix: string): boolean {
    return prefix in this.data.known;
  }

  markKnown(prefix: string, meta: PrefixMeta): void {
    this.data.known[prefix] = meta;
    this.data.empty = this.data.empty.filter(p => p !== prefix);
    this.save();
  }

  markEmpty(prefix: string): void {
    if (!this.data.empty.includes(prefix) && !(prefix in this.data.known)) {
      this.data.empty.push(prefix);
    }
    this.save();
  }

  updateMeta(prefix: string, meta: Partial<PrefixMeta>): void {
    if (prefix in this.data.known) {
      this.data.known[prefix] = { ...this.data.known[prefix], ...meta, updated: new Date().toISOString() };
      this.save();
    }
  }

  getStats() {
    return {
      known: Object.keys(this.data.known).length,
      empty: this.data.empty.length,
      totalCourts: Object.values(this.data.known).reduce((s, p) => s + p.count, 0),
      scanned: Object.values(this.data.known).filter(p => p.scanned).length,
    };
  }

  private save(): void {
    this.data.updated = new Date().toISOString();
    const dir = dirname(this.path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 2), 'utf-8');
  }
}
