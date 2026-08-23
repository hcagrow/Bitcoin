import type { Candle, CrossEvent, IndicatorSeries } from "../types";

// 라방이 쓰는 기간들을 일봉 기준으로 환산한 값.
// 50주 = 350일, Bull Market Support Band = 20주 SMA(140일) + 21주 EMA(147일).
export const MA_50W_PERIOD = 350;
export const BMSB_SMA_PERIOD = 140;
export const BMSB_EMA_PERIOD = 147;
export const RSI_PERIOD = 14;

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * EMA seeded with the first `period` values' SMA, and left null before that —
 * seeding from a single price makes the early curve meaningless, and the band
 * built from it would start in the wrong place.
 */
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(values: number[], period = RSI_PERIOD): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function buildIndicatorSeries(candles: Candle[]): IndicatorSeries {
  const close = candles.map((c) => c.close);
  return {
    dates: candles.map((c) => c.date),
    candles,
    close,
    ma50: sma(close, 50),
    ma200: sma(close, 200),
    ma50w: sma(close, MA_50W_PERIOD),
    bmsbSma: sma(close, BMSB_SMA_PERIOD),
    bmsbEma: ema(close, BMSB_EMA_PERIOD),
    rsi14: rsi(close),
  };
}

export function findCrosses(series: IndicatorSeries): CrossEvent[] {
  const events: CrossEvent[] = [];
  const { ma50, ma200, dates } = series;
  for (let i = 1; i < dates.length; i++) {
    const prev50 = ma50[i - 1];
    const prev200 = ma200[i - 1];
    const cur50 = ma50[i];
    const cur200 = ma200[i];
    if (prev50 == null || prev200 == null || cur50 == null || cur200 == null) continue;
    const wasBelow = prev50 <= prev200;
    const isAbove = cur50 > cur200;
    const wasAbove = prev50 >= prev200;
    const isBelow = cur50 < cur200;
    if (wasBelow && isAbove) {
      events.push({ index: i, date: dates[i], type: "golden" });
    } else if (wasAbove && isBelow) {
      events.push({ index: i, date: dates[i], type: "dead" });
    }
  }
  return events;
}

export function latestCrossState(events: CrossEvent[]): "golden" | "dead" | "unknown" {
  if (events.length === 0) return "unknown";
  return events[events.length - 1].type;
}

export function pctDelta(current: number, reference: number | null): number | null {
  if (reference == null || reference === 0) return null;
  return ((current - reference) / reference) * 100;
}
