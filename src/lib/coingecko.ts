import type { PricePoint } from "../types";

const CACHE_KEY = "btc-app-price-cache-v1";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const CURRENT_PRICE_CACHE_KEY = "btc-app-current-price-cache-v1";
// Short TTL: just enough to absorb rapid manual page reloads without going stale
// against CoinGecko's anonymous-tier rate limit, while staying effectively "live".
const CURRENT_PRICE_CACHE_TTL_MS = 30 * 1000;

interface CacheShape {
  fetchedAt: number;
  days: number;
  points: PricePoint[];
}

interface CurrentPriceCacheShape {
  fetchedAt: number;
  price: number;
  change24h: number;
}

function readCache(days: number): PricePoint[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as CacheShape;
    if (cache.days !== days) return null;
    if (Date.now() - cache.fetchedAt > CACHE_TTL_MS) return null;
    return cache.points;
  } catch {
    return null;
  }
}

function writeCache(days: number, points: PricePoint[]): void {
  const cache: CacheShape = { fetchedAt: Date.now(), days, points };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage full or unavailable — ignore, caching is best-effort
  }
}

function readCurrentPriceCache(): { price: number; change24h: number } | null {
  try {
    const raw = localStorage.getItem(CURRENT_PRICE_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as CurrentPriceCacheShape;
    if (Date.now() - cache.fetchedAt > CURRENT_PRICE_CACHE_TTL_MS) return null;
    return { price: cache.price, change24h: cache.change24h };
  } catch {
    return null;
  }
}

function writeCurrentPriceCache(price: number, change24h: number): void {
  const cache: CurrentPriceCacheShape = { fetchedAt: Date.now(), price, change24h };
  try {
    localStorage.setItem(CURRENT_PRICE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage full or unavailable — ignore, caching is best-effort
  }
}

/**
 * Fetches daily BTC close prices from CoinGecko (free, no auth).
 * CoinGecko's free public API caps historical lookback at 365 days — requesting
 * more returns HTTP 401 (error_code 10012). 365 still covers the 200-day MA with
 * room to spare, so keep this at or below 365.
 */
export async function fetchDailyPrices(days = 365): Promise<PricePoint[]> {
  const cached = readCache(days);
  if (cached) return cached;

  const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CoinGecko request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { prices: [number, number][] };

  const byDay = new Map<string, number>();
  for (const [ts, price] of data.prices) {
    const date = new Date(ts).toISOString().slice(0, 10);
    byDay.set(date, price); // keep the last sample of each day
  }
  const points: PricePoint[] = Array.from(byDay.entries())
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => a.date.localeCompare(b.date));

  writeCache(days, points);
  return points;
}

export async function fetchCurrentPrice(): Promise<{ price: number; change24h: number }> {
  const cached = readCurrentPriceCache();
  if (cached) return cached;

  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true";
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CoinGecko request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { bitcoin: { usd: number; usd_24h_change: number } };
  const result = { price: data.bitcoin.usd, change24h: data.bitcoin.usd_24h_change };
  writeCurrentPriceCache(result.price, result.change24h);
  return result;
}
