import { useEffect, useMemo, useState } from "react";
import { DerivativesPanel } from "./components/DerivativesPanel";
import { EtfFlowPanel } from "./components/EtfFlowPanel";
import { PriceChart } from "./components/PriceChart";
import { RealDemandCard } from "./components/RealDemandCard";
import { SettingsPanel } from "./components/SettingsPanel";
import { SummaryCard } from "./components/SummaryCard";
import { ZoneGauge } from "./components/ZoneGauge";
import { fetchCurrentPrice, fetchDailyPrices } from "./lib/coingecko";
import { loadEntries, removeByDate, saveEntries, upsertByDate } from "./lib/entryStore";
import { buildIndicatorSeries, findCrosses, latestCrossState } from "./lib/indicators";
import { evaluateRealDemand } from "./lib/realDemand";
import { getZone, loadZones, saveZones } from "./lib/zones";
import type { DerivativesEntry, EtfFlowEntry, IndicatorSeries, Zone } from "./types";

const ETF_STORAGE_KEY = "btc-app-etf-flow-v1";
const DERIV_STORAGE_KEY = "btc-app-derivatives-v1";

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
  const [etfEntries, setEtfEntries] = useState<EtfFlowEntry[]>(() => loadEntries(ETF_STORAGE_KEY));
  const [derivEntries, setDerivEntries] = useState<DerivativesEntry[]>(() => loadEntries(DERIV_STORAGE_KEY));

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

  const realDemand = useMemo(() => evaluateRealDemand(etfEntries, derivEntries), [etfEntries, derivEntries]);

  function handleSaveZones(next: Zone[]) {
    setZones(next);
    saveZones(next);
  }

  function handleAddEtfEntry(entry: EtfFlowEntry) {
    setEtfEntries((prev) => {
      const next = upsertByDate(prev, entry);
      saveEntries(ETF_STORAGE_KEY, next);
      return next;
    });
  }

  function handleDeleteEtfEntry(date: string) {
    setEtfEntries((prev) => {
      const next = removeByDate(prev, date);
      saveEntries(ETF_STORAGE_KEY, next);
      return next;
    });
  }

  function handleAddDerivEntry(entry: DerivativesEntry) {
    setDerivEntries((prev) => {
      const next = upsertByDate(prev, entry);
      saveEntries(DERIV_STORAGE_KEY, next);
      return next;
    });
  }

  function handleDeleteDerivEntry(date: string) {
    setDerivEntries((prev) => {
      const next = removeByDate(prev, date);
      saveEntries(DERIV_STORAGE_KEY, next);
      return next;
    });
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
        </>
      )}

      <RealDemandCard result={realDemand} />

      <section className="section">
        <h2>반자동 데이터 입력</h2>
        <p className="section-sub">
          ETF 자금 흐름과 청산·미결제약정·펀딩비를 매일 입력하면, 위 실수요 판정에 자동으로 반영됩니다.
        </p>
        <EtfFlowPanel entries={etfEntries} onAdd={handleAddEtfEntry} onDelete={handleDeleteEtfEntry} />
        <DerivativesPanel entries={derivEntries} onAdd={handleAddDerivEntry} onDelete={handleDeleteDerivEntry} />
      </section>

      <p className="disclaimer">
        이 대시보드는 예측을 제공하지 않습니다. 미리 정한 기준선과 조건 대비 현재 상태만 계산해 보여주며,
        최종 판단은 사용자의 몫입니다.
      </p>

      {settingsOpen && (
        <SettingsPanel zones={zones} onSave={handleSaveZones} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
