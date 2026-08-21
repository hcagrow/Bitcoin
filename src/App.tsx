import { useEffect, useMemo, useState } from "react";
import { PriceChart } from "./components/PriceChart";
import { SettingsPanel } from "./components/SettingsPanel";
import { SummaryCard } from "./components/SummaryCard";
import { ZoneGauge } from "./components/ZoneGauge";
import { fetchCurrentPrice, fetchDailyPrices } from "./lib/coingecko";
import { buildIndicatorSeries, findCrosses, latestCrossState } from "./lib/indicators";
import { getZone, loadZones, saveZones } from "./lib/zones";
import type { IndicatorSeries, Zone } from "./types";

const RANGE_OPTIONS = [
  { label: "4개월", days: 120 },
  { label: "1년", days: 365 },
  { label: "2년", days: 730 },
];

export default function App() {
  const [zones, setZones] = useState<Zone[]>(() => loadZones());
  const [series, setSeries] = useState<IndicatorSeries | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [change24h, setChange24h] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rangeDays, setRangeDays] = useState(365);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [points, current] = await Promise.all([fetchDailyPrices(400), fetchCurrentPrice()]);
        if (cancelled) return;
        setSeries(buildIndicatorSeries(points));
        setLivePrice(current.price);
        setChange24h(current.change24h);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const crossState = useMemo(() => {
    if (!series) return "unknown" as const;
    return latestCrossState(findCrosses(series));
  }, [series]);

  const price = livePrice ?? (series ? series.close[series.close.length - 1] : null);
  const ma50 = series ? series.ma50[series.ma50.length - 1] : null;
  const ma200 = series ? series.ma200[series.ma200.length - 1] : null;
  const currentZone = price != null ? getZone(zones, price) : undefined;

  function handleSaveZones(next: Zone[]) {
    setZones(next);
    saveZones(next);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>BTC 기준선 대시보드</h1>
        <button type="button" className="settings-btn" onClick={() => setSettingsOpen(true)}>
          설정
        </button>
      </header>

      {loading && !series && <div className="status-msg">불러오는 중…</div>}
      {error && <div className="status-msg error">오류: {error}</div>}

      {series && price != null && (
        <>
          <SummaryCard
            price={price}
            change24h={change24h}
            ma50={ma50}
            ma200={ma200}
            crossState={crossState}
            zone={currentZone}
          />

          <section className="section">
            <h2>구간 게이지</h2>
            <ZoneGauge zones={zones} price={price} />
          </section>

          <section className="section">
            <div className="section-header-row">
              <h2>가격 차트 (이동평균 오버레이)</h2>
              <div className="range-buttons">
                {RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    className={rangeDays === opt.days ? "active" : ""}
                    onClick={() => setRangeDays(opt.days)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <PriceChart series={series} rangeDays={rangeDays} />
          </section>

          <p className="disclaimer">
            이 대시보드는 예측을 제공하지 않습니다. 미리 정한 기준선 대비 현재가의 위치만 계산해 보여주며,
            최종 판단은 사용자의 몫입니다.
          </p>
        </>
      )}

      {settingsOpen && (
        <SettingsPanel zones={zones} onSave={handleSaveZones} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
