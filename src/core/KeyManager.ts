import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { ApiClient } from './ApiClient.js';

interface ApiKey {
  apiKey: string;
  secretKey: string;
  filename: string;
}

export class KeyManager {
  private keys: ApiKey[] = [];
  private currentIndex = 0;
  private usedRequests = 0;
  private totalRequestCount = 0;
  private currentClient: ApiClient | null = null;
  private limitPerKey = 9500;

  async init(keysDir: string, skipFiles: string[] = ['1.env'], limitPerKey = 9500): Promise<void> {
    this.limitPerKey = limitPerKey;
    const files = readdirSafe(keysDir)
      .filter(f => f.endsWith('.env') && !skipFiles.includes(f))
      .sort();

    if (files.length === 0) {
      throw new Error(`❌ Нет ключей в ${keysDir} (кроме ${skipFiles.join(', ')})`);
    }

    for (const file of files) {
      const content = readFileSync(join(keysDir, file), 'utf-8');
      const apiKey = parseEnvValue(content, 'DADATA_API_KEY');
      const secretKey = parseEnvValue(content, 'DADATA_SECRET_KEY') ?? '';
      if (apiKey) this.keys.push({ apiKey, secretKey, filename: file });
    }

    if (this.keys.length === 0) {
      throw new Error(`❌ Нет валидных ключей в ${keysDir}`);
    }

    const total = this.keys.length * this.limitPerKey;
    console.log(`🔑 Ключей: ${this.keys.length} (${this.keys.map(k => k.filename).join(', ')})`);
    console.log(`📊 Лимит на ключ: ${this.limitPerKey}, всего: ~${total}\n`);

    this.currentClient = this.createClient(0);
  }

  getClient(): ApiClient {
    if (!this.currentClient) throw new Error('KeyManager не инициализирован');
    return this.currentClient;
  }

  async trackRequest(): Promise<boolean> {
    this.usedRequests++;
    this.totalRequestCount++;
    if (this.usedRequests >= this.limitPerKey) return this.rotate();
    return true;
  }

  private async rotate(): Promise<boolean> {
    console.log(`\n🔄 Ключ ${this.keys[this.currentIndex].filename} исчерпан (${this.usedRequests})`);
    await this.currentClient?.shutdown();
    this.currentIndex++;
    this.usedRequests = 0;
    if (this.currentIndex >= this.keys.length) {
      console.log(`❌ Все ключи исчерпаны. Всего запросов: ${this.totalRequestCount}`);
      this.currentClient = null;
      return false;
    }
    this.currentClient = this.createClient(this.currentIndex);
    const rem = this.keys.length - this.currentIndex;
    console.log(`✅ Переключено на ${this.keys[this.currentIndex].filename} (осталось: ${rem})\n`);
    return true;
  }

  async shutdown(): Promise<void> {
    await this.currentClient?.shutdown();
    this.currentClient = null;
  }

  getStats() {
    return {
      currentKey: this.keys[this.currentIndex]?.filename ?? '—',
      currentKeyRequests: this.usedRequests,
      totalRequests: this.totalRequestCount,
      keysUsed: this.currentIndex + 1,
      keysRemaining: Math.max(0, this.keys.length - this.currentIndex - 1),
      remainingCapacity:
        Math.max(0, this.keys.length - this.currentIndex - 1) * this.limitPerKey +
        (this.limitPerKey - this.usedRequests),
    };
  }

  private createClient(index: number): ApiClient {
    const key = this.keys[index];
    console.log(`🔑 Активный: ${key.filename}`);
    return new ApiClient({ apiKey: key.apiKey, secretKey: key.secretKey });
  }
}

function parseEnvValue(content: string, key: string): string | null {
  const m = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m ? m[1].trim() : null;
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
