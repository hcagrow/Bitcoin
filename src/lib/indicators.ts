import type { CrossEvent, IndicatorSeries, PricePoint } from "../types";

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

export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

export function buildIndicatorSeries(points: PricePoint[]): IndicatorSeries {
  const dates = points.map((p) => p.date);
  const close = points.map((p) => p.close);
  return {
    dates,
    close,
    ma50: sma(close, 50),
    ma200: sma(close, 200),
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
