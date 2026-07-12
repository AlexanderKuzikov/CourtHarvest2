import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import Bottleneck from 'bottleneck';
import {
  DaDataRequest, DaDataResponse, CourtData, CourtType,
} from '../types/dadata.js';

export class QuotaExceededError extends Error {
  constructor(message = 'DaData API quota exceeded') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

export class DaDataApiError extends Error {
  public statusCode?: number;
  public responseData?: unknown;
  constructor(message: string, statusCode?: number, responseData?: unknown) {
    super(message);
    this.name = 'DaDataApiError';
    this.statusCode = statusCode;
    this.responseData = responseData;
  }
}

export interface ApiClientConfig {
  apiKey: string;
  secretKey?: string;
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
  rateLimit?: {
    maxConcurrent?: number;
    minTime?: number;
  };
}

export interface ClientStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  quotaErrors: number;
}

export class ApiClient {
  private axiosInstance: AxiosInstance;
  private limiter: Bottleneck;
  private config: Required<ApiClientConfig>;
  private stats: ClientStats;
  private requestCounter: number;

  constructor(config: ApiClientConfig) {
    this.config = {
      apiKey: config.apiKey,
      secretKey: config.secretKey || config.apiKey,
      baseURL: config.baseURL || 'https://suggestions.dadata.ru/suggestions/api/4_1/rs',
      timeout: config.timeout || 10_000,
      maxRetries: config.maxRetries || 3,
      rateLimit: {
        maxConcurrent: config.rateLimit?.maxConcurrent || 5,
        minTime: config.rateLimit?.minTime || 50,
      },
    };

    this.stats = { totalRequests: 0, successfulRequests: 0, failedRequests: 0, quotaErrors: 0 };
    this.requestCounter = 0;

    this.axiosInstance = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Token ${this.config.apiKey}`,
        'X-Secret': this.config.secretKey,
      },
    });

    axiosRetry(this.axiosInstance, {
      retries: this.config.maxRetries,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error: AxiosError) =>
        axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        (error.response?.status !== undefined && error.response.status >= 500),
      onRetry: (retryCount, error) => {
        console.warn(`[ApiClient] retry ${retryCount}/${this.config.maxRetries}: ${error.message}`);
      },
    });

    this.limiter = new Bottleneck({
      maxConcurrent: this.config.rateLimit.maxConcurrent,
      minTime: this.config.rateLimit.minTime,
      reservoir: 20,
      reservoirRefreshAmount: 20,
      reservoirRefreshInterval: 1_000,
    });

    this.limiter.on('error', (err) => console.error('[ApiClient] bottleneck error:', err));
    this.limiter.on('depleted', () => console.warn('[ApiClient] reservoir depleted, queueing…'));
  }

  async suggestCourt(
    query: string,
    options?: { count?: number; region_code?: string; court_type?: CourtType | CourtType[] },
  ): Promise<DaDataResponse<CourtData>> {
    const body: DaDataRequest = { query, count: options?.count || 10 };
    if (options?.region_code) body.locations = [{ region_code: options.region_code }];
    if (options?.court_type) body.filters = [{ court_type: options.court_type }];

    this.stats.totalRequests++;
    const jobId = `court-${Date.now()}-${++this.requestCounter}`;

    return this.limiter.schedule({ id: jobId }, async () => {
      try {
        const resp = await this.axiosInstance.post<DaDataResponse<CourtData>>(
          '/suggest/court', body,
        );
        this.stats.successfulRequests++;
        return resp.data;
      } catch (error) {
        this.stats.failedRequests++;
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError<{ message?: string; detail?: string }>;
          if (axiosError.response?.status === 403) {
            this.stats.quotaErrors++;
            throw new QuotaExceededError(
              axiosError.response?.data?.message ||
              axiosError.response?.data?.detail ||
              'DaData daily limit (10 000) reached',
            );
          }
          const statusCode = axiosError.response?.status;
          const errMsg = axiosError.response?.data?.message ||
            axiosError.response?.data?.detail ||
            axiosError.message ||
            'Unknown DaData API error';
          throw new DaDataApiError(`[${statusCode || 'NETWORK'}] ${errMsg}`, statusCode, axiosError.response?.data);
        }
        throw error;
      }
    });
  }

  getStats(): ClientStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = { totalRequests: 0, successfulRequests: 0, failedRequests: 0, quotaErrors: 0 };
  }

  async clearQueue(): Promise<void> {
    await this.limiter.stop({ dropWaitingJobs: true });
  }

  async shutdown(): Promise<void> {
    await this.limiter.stop();
  }
}
