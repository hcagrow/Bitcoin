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
