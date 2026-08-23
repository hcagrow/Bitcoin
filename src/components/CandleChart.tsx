import {
  CandlestickSeries,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineData,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { Candle, CrossEvent, IndicatorSeries } from "../types";
import { BandSeries, type BandData } from "./bandSeries";

const COLORS = {
  up: "#26a69a",
  down: "#ef5350",
  ma50: "#3b6fd4",
  ma200: "#8b5cf6",
  ma50w: "#f2a900",
  bmsb: "#8a6d3b",
  realized: "#2e8b57",
  balanced: "#c0392b",
  rsi: "#b388ff",
};

function toTime(date: string): UTCTimestamp {
  return (Date.parse(date) / 1000) as UTCTimestamp;
}

/** Drops the leading nulls so a series starts where it actually has values. */
function lineData(dates: string[], values: (number | null)[]): LineData<Time>[] {
  const out: LineData<Time>[] = [];
  for (let i = 0; i < dates.length; i++) {
    const v = values[i];
    if (v == null) continue;
    out.push({ time: toTime(dates[i]), value: v });
  }
  return out;
}

function flatLine(dates: string[], value: number): LineData<Time>[] {
  return dates.map((d) => ({ time: toTime(d), value }));
}

interface Props {
  series: IndicatorSeries;
  /** "1d"면 기존 지표(이평선·불마켓밴드·RSI·크로스마커)를 그대로 그린다. 그 외 봉 단위는
   *  전부 일봉 기준 계산이라 의미가 없으므로 캔들만 보여준다. */
  interval: string;
  /** interval이 "1d"가 아닐 때 그 봉 단위로 새로 받아온 캔들. */
  intradayCandles: Candle[] | null;
  crosses: CrossEvent[];
  realizedPrice?: number;
  balancedPrice?: number;
  isDark: boolean;
}

export function CandleChart({
  series,
  interval,
  intradayCandles,
  crosses,
  realizedPrice,
  balancedPrice,
  isDark,
}: Props) {
  const showIndicators = interval === "1d";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // Build the chart once, then feed it data in a separate effect so changing the
  // range or an overlay value doesn't tear down and rebuild the whole chart.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { color: "transparent" },
        textColor: isDark ? "#9ca3af" : "#4a4650",
        attributionLogo: false,
        panes: { separatorColor: isDark ? "#2e303a" : "#e5e4e7" },
      },
      grid: {
        vertLines: { color: isDark ? "#23252e" : "#eeeef0" },
        horzLines: { color: isDark ? "#23252e" : "#eeeef0" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: isDark ? "#2e303a" : "#e5e4e7" },
      timeScale: { borderColor: isDark ? "#2e303a" : "#e5e4e7", timeVisible: true },
      autoSize: true,
    });
    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [isDark]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // The chart-creation effect above owns this instance and nulls the ref when it
    // tears the chart down. Its cleanup runs *before* this one, so cleanup here must
    // confirm the chart it built against is still the live one — calling removeSeries
    // on a destroyed chart throws.
    const isStillLive = () => chartRef.current === chart;

    // Rebuild every series on data change — lightweight-charts has no bulk
    // "replace all series", and the set of overlays varies with user input.
    const created: ISeriesApi<"Candlestick" | "Line">[] = [];
    const add = <T extends "Candlestick" | "Line">(s: ISeriesApi<T>) => {
      created.push(s as ISeriesApi<"Candlestick" | "Line">);
      return s;
    };

    // 1일 봉이면 서버가 이미 채워둔 지표 시리즈를 쓰고, 그 외 봉 단위는 별도로 받아온
    // 캔들만 쓴다 — 50일선 같은 지표는 일봉 기준 계산이라 다른 봉에 얹으면 값 자체가 잘못됐다.
    const dates = showIndicators ? series.dates : (intradayCandles ?? []).map((c) => c.date);
    const candles = showIndicators ? series.candles : (intradayCandles ?? []);

    let bandSeries: ISeriesApi<"Custom"> | null = null;
    if (showIndicators) {
      // 불마켓밴드: 20주 SMA와 21주 EMA 사이를 채운 밴드 (라방 차트의 갈색 띠).
      const bandData: BandData[] = [];
      for (let i = 0; i < dates.length; i++) {
        const a = series.bmsbSma[i];
        const b = series.bmsbEma[i];
        if (a == null || b == null) continue;
        bandData.push({ time: toTime(dates[i]), upper: Math.max(a, b), lower: Math.min(a, b) });
      }
      if (bandData.length > 0) {
        bandSeries = chart.addCustomSeries(new BandSeries(), {
          priceLineVisible: false,
          lastValueVisible: false,
          // 밝은 배경에선 옅게, 어두운 배경에선 진하게 — 라방 차트의 갈색 띠 느낌을 맞춘다.
          fillColor: isDark ? "rgba(166, 124, 52, 0.45)" : "rgba(150, 110, 45, 0.3)",
          lineColor: isDark ? "rgba(190, 145, 65, 0.95)" : "rgba(140, 103, 42, 0.85)",
        });
        bandSeries.setData(bandData);
      }
    }

    const candleSeries = add(
      chart.addSeries(CandlestickSeries, {
        upColor: COLORS.up,
        downColor: COLORS.down,
        borderUpColor: COLORS.up,
        borderDownColor: COLORS.down,
        wickUpColor: COLORS.up,
        wickDownColor: COLORS.down,
      }),
    );
    candleSeries.setData(
      candles.map((c) => ({
        time: toTime(c.date),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    candleSeriesRef.current = candleSeries;

    let markerApi: ISeriesMarkersPluginApi<Time> | null = null;
    let rsiSeries: ISeriesApi<"Line"> | null = null;

    if (showIndicators) {
      const ma50 = add(
        chart.addSeries(LineSeries, { color: COLORS.ma50, lineWidth: 1, priceLineVisible: false, title: "50일" }),
      );
      ma50.setData(lineData(dates, series.ma50));

      const ma200 = add(
        chart.addSeries(LineSeries, { color: COLORS.ma200, lineWidth: 2, priceLineVisible: false, title: "200일" }),
      );
      ma200.setData(lineData(dates, series.ma200));

      const ma50w = add(
        chart.addSeries(LineSeries, { color: COLORS.ma50w, lineWidth: 2, priceLineVisible: false, title: "50주" }),
      );
      ma50w.setData(lineData(dates, series.ma50w));

      if (realizedPrice != null) {
        const s = add(
          chart.addSeries(LineSeries, {
            color: COLORS.realized,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false,
            title: "실현가격",
          }),
        );
        s.setData(flatLine(dates, realizedPrice));
      }
      if (balancedPrice != null) {
        const s = add(
          chart.addSeries(LineSeries, {
            color: COLORS.balanced,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false,
            title: "밸런스가격",
          }),
        );
        s.setData(flatLine(dates, balancedPrice));
      }

      // 골든/데드크로스 마커
      const markers: SeriesMarker<Time>[] = crosses.map((c) => ({
        time: toTime(c.date),
        position: c.type === "golden" ? ("belowBar" as const) : ("aboveBar" as const),
        color: c.type === "golden" ? COLORS.up : COLORS.down,
        shape: c.type === "golden" ? ("arrowUp" as const) : ("arrowDown" as const),
        text: c.type === "golden" ? "골든" : "데드",
      }));
      markerApi = markers.length > 0 ? createSeriesMarkers(candleSeries, markers) : null;

      // RSI 서브차트 (pane 1)
      rsiSeries = chart.addSeries(
        LineSeries,
        { color: COLORS.rsi, lineWidth: 1, priceLineVisible: false, title: "RSI(14)" },
        1,
      );
      rsiSeries.setData(lineData(dates, series.rsi14));
      // 과매수 70 / 과매도 30 기준선
      for (const level of [70, 30]) {
        rsiSeries.createPriceLine({
          price: level,
          color: isDark ? "#4b4f5c" : "#c9c9cf",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "",
        });
      }
      const panes = chart.panes();
      if (panes.length > 1) {
        panes[0].setHeight(280);
        panes[1].setHeight(90);
      }
    }

    chart.timeScale().fitContent();

    return () => {
      candleSeriesRef.current = null;
      if (!isStillLive()) return; // chart already destroyed — its series went with it
      markerApi?.setMarkers([]);
      for (const s of created) chart.removeSeries(s);
      if (bandSeries) chart.removeSeries(bandSeries);
      if (rsiSeries) chart.removeSeries(rsiSeries);
    };
  }, [series, interval, intradayCandles, crosses, realizedPrice, balancedPrice, isDark, showIndicators]);

  return <div className="candle-chart" ref={containerRef} />;
}
