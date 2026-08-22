export type ZoneTone = "위험" | "경계" | "관망" | "긍정" | "과열주의";

export interface Zone {
  id: string;
  min: number;
  max: number; // Infinity allowed for the top zone
  label: string;
  tone: ZoneTone;
}

export interface PricePoint {
  date: string; // ISO date (day granularity)
  close: number;
}

export interface Candle {
  date: string; // ISO date (day granularity)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorSeries {
  dates: string[];
  candles: Candle[];
  close: number[];
  ma50: (number | null)[];
  ma200: (number | null)[];
  /** 50주 이평선 — 일봉 기준 350일. 라방이 "가장 중요한 중장기 추세선"으로 보는 선. */
  ma50w: (number | null)[];
  /** Bull Market Support Band 하단/상단: 20주 SMA(140일)와 21주 EMA(147일). */
  bmsbSma: (number | null)[];
  bmsbEma: (number | null)[];
  rsi14: (number | null)[];
}

export interface CrossEvent {
  index: number;
  date: string;
  type: "golden" | "dead";
}

export interface EtfFlowEntry {
  date: string; // ISO date, one entry per day
  netFlowUsdM: number; // net flow in USD millions, positive = inflow
}

export interface DerivativesEntry {
  date: string; // ISO date, one entry per day
  liquidationUsdM?: number; // total liquidations that day, USD millions
  openInterestUsdM?: number; // total open interest, USD millions
  fundingRatePct?: number; // funding rate, % per 8h
}

export interface RealDemandCheck {
  label: string;
  passed: boolean | null; // null = insufficient data to judge
  detail: string;
}

export interface RealDemandResult {
  verdict: "실수요 가능성 높음" | "파생시장 효과 의심" | "판단 보류";
  checks: RealDemandCheck[];
}

export interface TradePlan {
  holdingsQty: number; // total holdings, e.g. BTC
  targetSellRatioPct: number; // target % of holdings to sell
}

export interface TradePlanChange {
  timestamp: string; // ISO datetime of the edit
  field: "holdingsQty" | "targetSellRatioPct";
  oldValue: number;
  newValue: number;
}

export interface TradeEntry {
  id: string;
  date: string; // ISO date
  side: "buy" | "sell";
  quantity: number;
  price: number; // execution price, USD
}

export interface TradeStats {
  totalTargetSellQty: number;
  cumulativeSoldQty: number;
  remainingTargetQty: number;
  avgSellPrice: number | null;
  sellProgressPct: number; // 0-100
  cumulativeBoughtQty: number;
  avgBuyPrice: number | null;
}

// A지표: 1=긍정, 0=대기/중립, -1=경계
export type IndicatorScore = 1 | 0 | -1;
export type IndicatorSource = "auto" | "manual";

export interface IndicatorResult {
  id: string;
  label: string;
  score: IndicatorScore | null; // null = 데이터 없음/판단 불가
  detail: string;
  source: IndicatorSource;
}

export interface ManualIndicatorState {
  score: IndicatorScore;
  rawValue?: number; // for threshold-classified indicators (MVRV, DXY)
  updatedAt: string; // ISO datetime
}

export type ManualIndicatorMap = Record<string, ManualIndicatorState>;

export interface DailyScoreSnapshot {
  date: string; // ISO date, one snapshot per day
  total: number;
}

export type ToneBucket = "긍정" | "경계" | "중립";

export interface SynthesisResult {
  headline: string;
  zoneTone: ZoneTone | null;
  zoneLabel: string | null;
  scoreTone: ToneBucket;
  confidence: string;
  mismatch: boolean;
  mismatchDetail: string | null;
  nextCheck: string;
  cycleSummary: string;
}

export interface BoundaryProximity {
  key: string; // `${zoneId}:${boundaryType}` — stable key for de-duping alerts
  zoneId: string;
  zoneLabel: string;
  boundaryPrice: number;
  boundaryType: "min" | "max";
  distancePct: number; // absolute distance from price, in %
}

export interface AlertLogEntry {
  timestamp: string; // ISO datetime
  zoneLabel: string;
  boundaryPrice: number;
  price: number;
}
