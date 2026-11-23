import type { Candle } from "../types";

// 기본 주소가 지역 차단되는 경우를 대비해 공개 데이터 미러를 예비 경로로 둔다.
// 두 주소 모두 무료·인증 불필요이며 동일한 응답 형식을 돌려준다.
const HOSTS = ["https://api.binance.com", "https://data-api.binance.vision"];

const CANDLE_CACHE_KEY = "btc-app-candle-cache-v1";
const PRICE_CACHE_KEY = "btc-app-binance-price-cache-v1";
const PRICE_CACHE_TTL_MS = 30 * 1000;

/** Binance klines 한 행: [openTime, open, high, low, close, volume, closeTime, ...] */
type RawKline = [number, string, string, string, string, string, number, ...unknown[]];

interface CandleCache {
  fetchedAt: number;
  limit: number;
  symbol: string;
  interval: string;
  candles: Candle[];
}

/** 봉 단위가 짧을수록 캐시를 짧게 둬야 "실시간"이라는 말이 무색해지지 않는다. */
function candleCacheTtlMs(interval: string): number {
  if (interval === "1m") return 30 * 1000;
  if (interval === "1h") return 2 * 60 * 1000;
  return 5 * 60 * 1000; // 1d, 1w
}

interface PriceCache {
  fetchedAt: number;
  price: number;
  change24h: number;
}

function readCache<T extends { fetchedAt: number }>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const cache = JSON.parse(raw) as T;
    if (Date.now() - cache.fetchedAt > ttlMs) return null;
    return cache;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — caching is best-effort
  }
}

/** Tries each host in turn so a regional block on the primary doesn't take the app down. */
async function fetchJson<T>(path: string): Promise<T> {
  let lastError: unknown = null;
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}${path}`);
      if (!res.ok) {
        lastError = new Error(`Binance 요청 실패: ${res.status} ${res.statusText}`);
        continue;
      }
      return (await res.json()) as T;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Binance에 연결하지 못했습니다");
}

/**
 * Fetches OHLC candles from Binance (free, no auth) at the given bar interval
 * ("1m" | "1h" | "1d" | "1w" — anything Binance's klines endpoint accepts).
 * 1000 is the endpoint's max per request, so shorter intervals cover a shorter
 * span of history (1000 one-minute bars is under a day; 1000 daily bars is
 * ~2.7 years).
 */
export async function fetchCandles(symbol: string, interval: string, limit = 1000): Promise<Candle[]> {
  const cacheKey = `${CANDLE_CACHE_KEY}:${symbol}:${interval}`;
  const cached = readCache<CandleCache>(cacheKey, candleCacheTtlMs(interval));
  if (cached && cached.limit === limit && cached.symbol === symbol && cached.interval === interval) {
    return cached.candles;
  }

  const rows = await fetchJson<RawKline[]>(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  const candles: Candle[] = rows.map((r) => ({
    date: new Date(r[0]).toISOString(),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }));

  writeCache(cacheKey, { fetchedAt: Date.now(), limit, symbol, interval, candles } satisfies CandleCache);
  return candles;
}

/** 지표(50/200/50주 이평선·불마켓밴드·RSI) 계산은 전부 일봉 기준이라 이 래퍼로 고정해 부른다. */
export async function fetchDailyCandles(symbol: string, limit = 1000): Promise<Candle[]> {
  return fetchCandles(symbol, "1d", limit);
}

export async function fetchCurrentPrice(symbol: string): Promise<{ price: number; change24h: number }> {
  const cacheKey = `${PRICE_CACHE_KEY}:${symbol}`;
  const cached = readCache<PriceCache>(cacheKey, PRICE_CACHE_TTL_MS);
  if (cached) return { price: cached.price, change24h: cached.change24h };

  const data = await fetchJson<{ lastPrice: string; priceChangePercent: string }>(
    `/api/v3/ticker/24hr?symbol=${symbol}`,
  );
  const result = { price: Number(data.lastPrice), change24h: Number(data.priceChangePercent) };
  writeCache(cacheKey, { fetchedAt: Date.now(), ...result } satisfies PriceCache);
  return result;
}

/** 알트 일봉 종가를 심볼별로 받는다. 일부가 실패해도 받은 것만 돌려준다(점수 계산이 부족분을 알아서 처리). */
export async function fetchAltCloses(symbols: string[], limit = 400): Promise<Record<string, number[]>> {
  const results = await Promise.allSettled(symbols.map((s) => fetchCandles(s, "1d", limit)));
  const out: Record<string, number[]> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled") out[symbols[i]] = r.value.map((c) => c.close);
  });
  return out;
}

const FUNDING_CACHE_TTL_MS = 5 * 60 * 1000;
let fundingCache: { fetchedAt: number; key: string; rates: Record<string, number> } | null = null;

/**
 * 무기한 선물 최근 8시간 펀딩비(소수). 선물 서버(fapi)는 지역에 따라 막히므로 실패한 종목은 빼고
 * 돌려준다 — 전부 실패하면 빈 객체라 "선물 펀딩비" 항목만 데이터 부족으로 남는다.
 */
export async function fetchFundingRates(symbols: string[]): Promise<Record<string, number>> {
  const key = symbols.join(",");
  if (fundingCache && fundingCache.key === key && Date.now() - fundingCache.fetchedAt < FUNDING_CACHE_TTL_MS) {
    return fundingCache.rates;
  }
  const results = await Promise.allSettled(
    symbols.map(async (s) => {
      const res = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${s}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { lastFundingRate?: string };
      return Number(data.lastFundingRate);
    }),
  );
  const rates: Record<string, number> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && Number.isFinite(r.value)) rates[symbols[i]] = r.value;
  });
  fundingCache = { fetchedAt: Date.now(), key, rates };
  return rates;
}
