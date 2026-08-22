import type { Candle } from "../types";

// 기본 주소가 지역 차단되는 경우를 대비해 공개 데이터 미러를 예비 경로로 둔다.
// 두 주소 모두 무료·인증 불필요이며 동일한 응답 형식을 돌려준다.
const HOSTS = ["https://api.binance.com", "https://data-api.binance.vision"];

const SYMBOL = "BTCUSDT";
const CANDLE_CACHE_KEY = "btc-app-candle-cache-v1";
const CANDLE_CACHE_TTL_MS = 5 * 60 * 1000;
const PRICE_CACHE_KEY = "btc-app-binance-price-cache-v1";
const PRICE_CACHE_TTL_MS = 30 * 1000;

/** Binance klines 한 행: [openTime, open, high, low, close, volume, closeTime, ...] */
type RawKline = [number, string, string, string, string, string, number, ...unknown[]];

interface CandleCache {
  fetchedAt: number;
  limit: number;
  candles: Candle[];
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
 * Fetches daily OHLC candles from Binance (free, no auth).
 * 1000 is the endpoint's max per request — enough for the 50-week (350-day) MA
 * plus a full two-year chart window, which CoinGecko's free tier cannot supply.
 */
export async function fetchDailyCandles(limit = 1000): Promise<Candle[]> {
  const cached = readCache<CandleCache>(CANDLE_CACHE_KEY, CANDLE_CACHE_TTL_MS);
  if (cached && cached.limit === limit) return cached.candles;

  const rows = await fetchJson<RawKline[]>(`/api/v3/klines?symbol=${SYMBOL}&interval=1d&limit=${limit}`);
  const candles: Candle[] = rows.map((r) => ({
    date: new Date(r[0]).toISOString().slice(0, 10),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }));

  writeCache(CANDLE_CACHE_KEY, { fetchedAt: Date.now(), limit, candles } satisfies CandleCache);
  return candles;
}

export async function fetchCurrentPrice(): Promise<{ price: number; change24h: number }> {
  const cached = readCache<PriceCache>(PRICE_CACHE_KEY, PRICE_CACHE_TTL_MS);
  if (cached) return { price: cached.price, change24h: cached.change24h };

  const data = await fetchJson<{ lastPrice: string; priceChangePercent: string }>(
    `/api/v3/ticker/24hr?symbol=${SYMBOL}`,
  );
  const result = { price: Number(data.lastPrice), change24h: Number(data.priceChangePercent) };
  writeCache(PRICE_CACHE_KEY, { fetchedAt: Date.now(), ...result } satisfies PriceCache);
  return result;
}
