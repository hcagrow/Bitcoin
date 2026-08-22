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

export interface IndicatorSeries {
  dates: string[];
  close: number[];
  ma50: (number | null)[];
  ma200: (number | null)[];
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
