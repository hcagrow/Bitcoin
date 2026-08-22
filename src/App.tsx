import { useEffect, useMemo, useRef, useState } from "react";
import { AIndicatorPanel } from "./components/AIndicatorPanel";
import { AIndicatorSummaryCard } from "./components/AIndicatorSummaryCard";
import { AlertsPanel } from "./components/AlertsPanel";
import { DerivativesPanel } from "./components/DerivativesPanel";
import { EtfFlowPanel } from "./components/EtfFlowPanel";
import { IndicatorHeatmap } from "./components/IndicatorHeatmap";
import { IndicatorRadarChart } from "./components/IndicatorRadarChart";
import { PriceChart } from "./components/PriceChart";
import { RealDemandCard } from "./components/RealDemandCard";
import { ScoreTrendChart } from "./components/ScoreTrendChart";
import { SettingsPanel } from "./components/SettingsPanel";
import { SummaryCard } from "./components/SummaryCard";
import { SynthesisCard } from "./components/SynthesisCard";
import { TradeLedgerPanel } from "./components/TradeLedgerPanel";
import { TradePlanPanel } from "./components/TradePlanPanel";
import { TradeProgressCard } from "./components/TradeProgressCard";
import { ZoneGauge } from "./components/ZoneGauge";
import { computeIndicators, summarizeIndicators } from "./lib/aIndicators";
import { fetchCurrentPrice, fetchDailyPrices } from "./lib/coingecko";
import {
  loadEntries,
  loadObject,
  makeId,
  removeByDate,
  removeById,
  saveEntries,
  saveObject,
  upsertByDate,
} from "./lib/entryStore";
import { findNearbyBoundaries } from "./lib/boundaryAlerts";
import { buildIndicatorSeries, findCrosses, latestCrossState } from "./lib/indicators";
import { getNotificationPermission, requestNotificationPermission, sendLocalNotification } from "./lib/notifications";
import { evaluateRealDemand } from "./lib/realDemand";
import { synthesize } from "./lib/synthesis";
import { computeTradeStats } from "./lib/tradeLedger";
import { getZone, loadZones, saveZones } from "./lib/zones";
import type {
  AlertLogEntry,
  DailyScoreSnapshot,
  DerivativesEntry,
  EtfFlowEntry,
  IndicatorScore,
  IndicatorSeries,
  ManualIndicatorMap,
  TradeEntry,
  TradePlan,
  TradePlanChange,
  Zone,
} from "./types";

const ETF_STORAGE_KEY = "btc-app-etf-flow-v1";
const DERIV_STORAGE_KEY = "btc-app-derivatives-v1";
const TRADE_PLAN_KEY = "btc-app-trade-plan-v1";
const TRADE_PLAN_HISTORY_KEY = "btc-app-trade-plan-history-v1";
const TRADE_ENTRIES_KEY = "btc-app-trade-entries-v1";
const DEFAULT_TRADE_PLAN: TradePlan = { holdingsQty: 0, targetSellRatioPct: 0 };
const MANUAL_INDICATORS_KEY = "btc-app-manual-indicators-v1";
const EWY_NOTE_KEY = "btc-app-ewy-note-v1";
const SCORE_HISTORY_KEY = "btc-app-score-history-v1";
const ALERT_LOG_KEY = "btc-app-alert-log-v1";

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
  const [tradePlan, setTradePlan] = useState<TradePlan>(() => loadObject(TRADE_PLAN_KEY, DEFAULT_TRADE_PLAN));
  const [tradePlanHistory, setTradePlanHistory] = useState<TradePlanChange[]>(() =>
    loadEntries(TRADE_PLAN_HISTORY_KEY),
  );
  const [tradeEntries, setTradeEntries] = useState<TradeEntry[]>(() => loadEntries(TRADE_ENTRIES_KEY));
  const [manualIndicators, setManualIndicators] = useState<ManualIndicatorMap>(() =>
    loadObject(MANUAL_INDICATORS_KEY, {}),
  );
  const [ewyNote, setEwyNote] = useState<string>(() => loadObject(EWY_NOTE_KEY, ""));
  const [scoreHistory, setScoreHistory] = useState<DailyScoreSnapshot[]>(() => loadEntries(SCORE_HISTORY_KEY));
  const [notificationPermission, setNotificationPermission] = useState(() => getNotificationPermission());
  const [alertLog, setAlertLog] = useState<AlertLogEntry[]>(() => loadEntries(ALERT_LOG_KEY));
  const previouslyNearKeys = useRef<Set<string>>(new Set());

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
  const tradeStats = useMemo(() => computeTradeStats(tradePlan, tradeEntries), [tradePlan, tradeEntries]);

  const indicatorResults = useMemo(
    () =>
      computeIndicators({
        price,
        ma50,
        ma200,
        close: series?.close ?? [],
        crossState,
        etfEntries,
        derivEntries,
        manual: manualIndicators,
      }),
    [price, ma50, ma200, series, crossState, etfEntries, derivEntries, manualIndicators],
  );
  const indicatorTotals = useMemo(() => summarizeIndicators(indicatorResults), [indicatorResults]);

  const synthesis = useMemo(
    () =>
      synthesize({
        zone: currentZone,
        zones,
        price,
        aScoreTotal: indicatorTotals.total,
        aScoreScored: indicatorTotals.scored,
        realDemand,
      }),
    [currentZone, zones, price, indicatorTotals, realDemand],
  );

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setScoreHistory((prev) => {
      const existing = prev.find((s) => s.date === today);
      if (existing && existing.total === indicatorTotals.total) return prev;
      const next = upsertByDate(prev, { date: today, total: indicatorTotals.total });
      saveEntries(SCORE_HISTORY_KEY, next);
      return next;
    });
  }, [indicatorTotals.total]);

  const nearbyBoundaries = useMemo(() => (price != null ? findNearbyBoundaries(zones, price) : []), [zones, price]);

  useEffect(() => {
    if (price == null) return;
    const currentKeys = new Set(nearbyBoundaries.map((b) => b.key));
    const newlyEntered = nearbyBoundaries.filter((b) => !previouslyNearKeys.current.has(b.key));
    previouslyNearKeys.current = currentKeys;
    if (newlyEntered.length === 0) return;

    setAlertLog((prev) => {
      const timestamp = new Date().toISOString();
      const entries: AlertLogEntry[] = newlyEntered.map((b) => ({
        timestamp,
        zoneLabel: b.zoneLabel,
        boundaryPrice: b.boundaryPrice,
        price,
      }));
      const next = [...prev, ...entries];
      saveEntries(ALERT_LOG_KEY, next);
      return next;
    });

    for (const b of newlyEntered) {
      sendLocalNotification(
        "기준선 접근 알림",
        `가격이 '${b.zoneLabel}' 경계(${b.boundaryPrice.toLocaleString()}달러)에서 ${b.distancePct.toFixed(1)}% 이내로 접근했습니다.`,
      );
    }
  }, [nearbyBoundaries, price]);

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

  function handleSaveTradePlan(next: TradePlan) {
    const timestamp = new Date().toISOString();
    const changes: TradePlanChange[] = [];
    if (next.holdingsQty !== tradePlan.holdingsQty) {
      changes.push({ timestamp, field: "holdingsQty", oldValue: tradePlan.holdingsQty, newValue: next.holdingsQty });
    }
    if (next.targetSellRatioPct !== tradePlan.targetSellRatioPct) {
      changes.push({
        timestamp,
        field: "targetSellRatioPct",
        oldValue: tradePlan.targetSellRatioPct,
        newValue: next.targetSellRatioPct,
      });
    }
    setTradePlan(next);
    saveObject(TRADE_PLAN_KEY, next);
    if (changes.length > 0) {
      setTradePlanHistory((prev) => {
        const nextHistory = [...prev, ...changes];
        saveEntries(TRADE_PLAN_HISTORY_KEY, nextHistory);
        return nextHistory;
      });
    }
  }

  function handleAddTradeEntry(entry: Omit<TradeEntry, "id">) {
    setTradeEntries((prev) => {
      const next = [...prev, { ...entry, id: makeId() }];
      saveEntries(TRADE_ENTRIES_KEY, next);
      return next;
    });
  }

  function handleDeleteTradeEntry(id: string) {
    setTradeEntries((prev) => {
      const next = removeById(prev, id);
      saveEntries(TRADE_ENTRIES_KEY, next);
      return next;
    });
  }

  function handleSetTriState(id: string, score: IndicatorScore) {
    setManualIndicators((prev) => {
      const next = { ...prev, [id]: { score, updatedAt: new Date().toISOString() } };
      saveObject(MANUAL_INDICATORS_KEY, next);
      return next;
    });
  }

  function handleSetNumeric(id: string, rawValue: number) {
    setManualIndicators((prev) => {
      const existing = prev[id];
      const score = existing?.score ?? 0;
      const next = { ...prev, [id]: { score, rawValue, updatedAt: new Date().toISOString() } };
      saveObject(MANUAL_INDICATORS_KEY, next);
      return next;
    });
  }

  function handleSetEwyNote(note: string) {
    setEwyNote(note);
    saveObject(EWY_NOTE_KEY, note);
  }

  async function handleRequestNotificationPermission() {
    const result = await requestNotificationPermission();
    setNotificationPermission(result);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>BTC 기준선 대시보드</h1>
        <button type="button" className="settings-btn" onClick={() => setSettingsOpen(true)}>
          설정
        </button>
      </header>

      <SynthesisCard
        result={synthesis}
        aScoreTotal={indicatorTotals.total}
        aScoreScored={indicatorTotals.scored}
        realDemandVerdict={realDemand.verdict}
      />

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
            <AlertsPanel
              permission={notificationPermission}
              onRequestPermission={handleRequestNotificationPermission}
              nearby={nearbyBoundaries}
              alertLog={alertLog}
            />
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

      <AIndicatorSummaryCard totals={indicatorTotals} />

      <section className="section">
        <h2>A지표 종합 시각화</h2>
        <div className="ai-viz-grid">
          <div>
            <h3>레이더 차트 — 지금 이 순간</h3>
            <IndicatorRadarChart results={indicatorResults} />
          </div>
          <div>
            <h3>신호등 히트맵 — 빠르게 스캔</h3>
            <IndicatorHeatmap results={indicatorResults} />
          </div>
        </div>
        <h3>종합 점수 추세</h3>
        <ScoreTrendChart snapshots={scoreHistory} />
      </section>

      <section className="section">
        <AIndicatorPanel
          results={indicatorResults}
          manual={manualIndicators}
          onSetTriState={handleSetTriState}
          onSetNumeric={handleSetNumeric}
          ewyNote={ewyNote}
          onSetEwyNote={handleSetEwyNote}
        />
      </section>

      <TradeProgressCard stats={tradeStats} />

      <section className="section">
        <h2>매매 장부</h2>
        <TradePlanPanel plan={tradePlan} history={tradePlanHistory} onSave={handleSaveTradePlan} />
        <TradeLedgerPanel entries={tradeEntries} onAdd={handleAddTradeEntry} onDelete={handleDeleteTradeEntry} />
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
