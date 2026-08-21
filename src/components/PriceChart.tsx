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
import type { IndicatorSeries } from "../types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, TimeScale);

interface Props {
  series: IndicatorSeries;
  rangeDays: number;
}

export function PriceChart({ series, rangeDays }: Props) {
  const start = Math.max(0, series.dates.length - rangeDays);
  const dates = series.dates.slice(start);
  const close = series.close.slice(start);
  const ma50 = series.ma50.slice(start);
  const ma200 = series.ma200.slice(start);

  const data = {
    labels: dates,
    datasets: [
      {
        label: "BTC 종가",
        data: close,
        borderColor: "#f2a900",
        backgroundColor: "rgba(242,169,0,0.08)",
        fill: true,
        pointRadius: 0,
        borderWidth: 1.5,
        tension: 0.1,
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
        label: "200일 이평선",
        data: ma200,
        borderColor: "#8b5cf6",
        pointRadius: 0,
        borderWidth: 1.5,
        spanGaps: true,
      },
    ],
  };

  return (
    <div className="price-chart">
      <Line
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { position: "top", labels: { boxWidth: 12 } },
            tooltip: {
              callbacks: {
                label: (ctx) =>
                  `${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "—"}`,
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
