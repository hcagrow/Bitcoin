import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { CrossEvent, IndicatorSeries } from "../types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, TimeScale);

interface Props {
  series: IndicatorSeries;
  rangeDays: number;
  crosses: CrossEvent[];
  /** 온체인 실현가격(수동 입력). 값이 있으면 수평 점선으로 표시. */
  realizedPrice?: number;
  /** 온체인 밸런스가격(수동 입력). 값이 있으면 수평 점선으로 표시. */
  balancedPrice?: number;
}

/** Builds a sparse series that is null everywhere except at the given cross points. */
function crossMarkerData(
  crosses: CrossEvent[],
  type: CrossEvent["type"],
  start: number,
  length: number,
  ma200: (number | null)[],
): (number | null)[] {
  const out: (number | null)[] = new Array(length).fill(null);
  for (const c of crosses) {
    if (c.type !== type) continue;
    const localIndex = c.index - start;
    if (localIndex < 0 || localIndex >= length) continue;
    out[localIndex] = ma200[localIndex];
  }
  return out;
}

export function PriceChart({ series, rangeDays, crosses, realizedPrice, balancedPrice }: Props) {
  const start = Math.max(0, series.dates.length - rangeDays);
  const dates = series.dates.slice(start);
  const close = series.close.slice(start);
  const ma50 = series.ma50.slice(start);
  const ma200 = series.ma200.slice(start);
  const ema200 = series.ema200.slice(start);
  const len = dates.length;

  const goldenPoints = crossMarkerData(crosses, "golden", start, len, ma200);
  const deadPoints = crossMarkerData(crosses, "dead", start, len, ma200);
  const hasGolden = goldenPoints.some((v) => v != null);
  const hasDead = deadPoints.some((v) => v != null);

  const datasets = [
    // 불마켓밴드: 200일 EMA와 200일 SMA 사이를 반투명 영역으로 채움 (fill: "+1" → 다음 dataset까지)
    {
      label: "불마켓밴드",
      data: ema200,
      borderColor: "rgba(180,130,60,0.45)",
      backgroundColor: "rgba(200,150,60,0.16)",
      fill: "+1",
      pointRadius: 0,
      borderWidth: 1,
      spanGaps: true,
    },
    {
      label: "200일 이평선",
      data: ma200,
      borderColor: "#8b5cf6",
      pointRadius: 0,
      borderWidth: 1.5,
      spanGaps: true,
    },
    {
      label: "50일 이평선",
      data: ma50,
      borderColor: "#3b6fd4",
      pointRadius: 0,
      borderWidth: 1.5,
      spanGaps: true,
    },
    {
      label: "BTC 종가",
      data: close,
      borderColor: "#f2a900",
      backgroundColor: "rgba(242,169,0,0.06)",
      fill: true,
      pointRadius: 0,
      borderWidth: 2,
      tension: 0.1,
    },
  ];

  if (realizedPrice != null) {
    datasets.push({
      label: "실현가격",
      data: new Array(len).fill(realizedPrice),
      borderColor: "#2e8b57",
      borderDash: [6, 4],
      pointRadius: 0,
      borderWidth: 1.5,
      spanGaps: true,
    } as (typeof datasets)[number]);
  }
  if (balancedPrice != null) {
    datasets.push({
      label: "밸런스가격",
      data: new Array(len).fill(balancedPrice),
      borderColor: "#c0392b",
      borderDash: [6, 4],
      pointRadius: 0,
      borderWidth: 1.5,
      spanGaps: true,
    } as (typeof datasets)[number]);
  }

  // 골든/데드크로스 지점 마커 — 선은 그리지 않고 교차 지점에만 원을 찍음
  if (hasGolden) {
    datasets.push({
      label: "골든크로스",
      data: goldenPoints,
      borderColor: "#2e8b57",
      backgroundColor: "#2e8b57",
      pointRadius: 6,
      pointStyle: "circle",
      showLine: false,
      borderWidth: 2,
    } as unknown as (typeof datasets)[number]);
  }
  if (hasDead) {
    datasets.push({
      label: "데드크로스",
      data: deadPoints,
      borderColor: "#c0392b",
      backgroundColor: "#c0392b",
      pointRadius: 6,
      pointStyle: "circle",
      showLine: false,
      borderWidth: 2,
    } as unknown as (typeof datasets)[number]);
  }

  return (
    <div className="price-chart">
      <Line
        data={{ labels: dates, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { position: "top", labels: { boxWidth: 12, usePointStyle: true } },
            tooltip: {
              callbacks: {
                label: (ctx) =>
                  ctx.parsed.y == null
                    ? ""
                    : `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`,
              },
            },
          },
          scales: {
            x: { ticks: { maxTicksLimit: 8 } },
            y: {
              ticks: {
                callback: (v) => `$${Number(v).toLocaleString()}`,
              },
            },
          },
        }}
      />
    </div>
  );
}
