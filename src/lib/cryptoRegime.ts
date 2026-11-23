// 코인 시장 체력(0~100, 높을수록 위험선호). tradermonty/claude-trading-skills(MIT)의
// crypto-regime-analyzer 점수 규칙을 그대로 옮겼다. 원본의 "BTC 도미넌스" 항목은 과거 시계열을
// 무료로 한 번에 받을 방법이 없어 뺐고, 알트 유니버스는 CoinGecko 상위 N 대신 아래 고정 목록
// (바이낸스 USDT 현물)을 쓴다. 임계값은 해석을 위한 관례값이지 백테스트로 최적화한 값이 아니다.

export type RegimeComponentId = "btcTrend" | "altBreadth" | "funding" | "drawdownVol" | "momentum";

export interface RegimeComponent {
  id: RegimeComponentId;
  label: string;
  /** 모델 가중치 (도미넌스 15%를 뺀 원본 값). */
  weight: number;
  score: number | null;
  signal: string;
}

export interface RegimeResult {
  score: number | null;
  zone: "RISK_ON" | "NEUTRAL" | "RISK_OFF" | "UNKNOWN";
  label: string;
  components: RegimeComponent[];
}

export interface RegimeInput {
  btcCloses: number[];
  /** BTC를 뺀 알트 일봉 종가 (오래된 것 → 최신). */
  altCloses: Record<string, number[]>;
  /** 심볼별 최근 8시간 펀딩비(소수). 예: 0.0001 = +0.010%. */
  funding: Record<string, number>;
}

export const ALT_UNIVERSE = [
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "TRXUSDT",
  "LINKUSDT",
  "AVAXUSDT",
  "LTCUSDT",
  "DOTUSDT",
  "BCHUSDT",
];
export const FUNDING_SYMBOLS = ["BTCUSDT", ...ALT_UNIVERSE.slice(0, 5)];

const WEIGHTS: Record<RegimeComponentId, number> = {
  btcTrend: 0.25,
  altBreadth: 0.2,
  funding: 0.15,
  drawdownVol: 0.15,
  momentum: 0.1,
};
const LABELS: Record<RegimeComponentId, string> = {
  btcTrend: "BTC 추세 구조",
  altBreadth: "알트 참여도",
  funding: "선물 펀딩비",
  drawdownVol: "낙폭·변동성 위치",
  momentum: "30일 모멘텀 폭",
};

// 원본(도미넌스 포함 가중치 합 1.0): 성분 4개 이상이고 남은 가중치가 0.65 이상이어야 종합 점수를 낸다.
const MIN_COMPONENTS = 4;
const MIN_WEIGHT = 0.65;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const sma = (xs: number[], window: number) => mean(xs.slice(-window));
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-12 * Math.max(Math.abs(a), Math.abs(b));

const noData = (signal: string) => ({ score: null, signal });

export function btcTrend(closes: number[]): { score: number | null; signal: string } {
  const SLOPE = 20;
  if (closes.length < 200 + SLOPE) return noData("데이터 부족: 일봉 220개 필요");
  const price = closes[closes.length - 1];
  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);
  const prev = mean(closes.slice(-(200 + SLOPE), -SLOPE));
  const dir = close(ma200, prev) ? "flat" : ma200 > prev ? "rising" : "falling";
  const flat = close(price, ma200) && close(ma50, ma200);

  let base: number;
  let structure: string;
  if (flat) [base, structure] = [50, "보합"];
  else if (price > ma50 && ma50 > ma200) [base, structure] = [90, "정배열(현재가>50일>200일)"];
  else if (price > ma200 && price <= ma50 && ma50 > ma200) [base, structure] = [65, "정배열 눌림(200일~50일 사이)"];
  else if (price <= ma200 && price <= ma50 && ma50 > ma200) [base, structure] = [55, "정배열 유지, 현재가는 두 선 아래"];
  else if (price > ma50 && ma50 <= ma200) [base, structure] = [45, "회복 시도(50일선 위, 배열은 아직 역배열)"];
  else [base, structure] = [15, "역배열(현재가<50일<200일)"];

  const slope = dir === "rising" ? 10 : dir === "falling" ? -10 : 0;
  let signal = `${structure}; 200일선 ${dir === "rising" ? "상승" : dir === "falling" ? "하락" : "횡보"}`;
  if (!flat && ma200 > 0 && Math.abs(ma50 - ma200) / ma200 < 0.015) signal += "; 50/200일선 1.5% 이내(교차 주시)";
  return { score: clamp(base + slope), signal };
}

function pctAbove(map: Record<string, number[]>, window: number): { pct: number; counted: number } {
  let above = 0;
  let counted = 0;
  for (const closes of Object.values(map)) {
    if (closes.length < window) continue;
    counted++;
    if (closes[closes.length - 1] > sma(closes, window)) above++;
  }
  return { pct: counted ? (above / counted) * 100 : 0, counted };
}

export function altBreadth(alts: Record<string, number[]>): { score: number | null; signal: string } {
  const eligible = Object.fromEntries(Object.entries(alts).filter(([, c]) => c.length >= 200));
  const { pct: p200, counted } = pctAbove(eligible, 200);
  if (counted < 5) return noData(`데이터 부족: 200일 이상 이력이 있는 알트 ${counted}개 (5개 필요)`);
  const { pct: p50 } = pctAbove(eligible, 50);
  let score = p200 >= 80 ? 95 : p200 >= 65 ? 80 : p200 >= 50 ? 65 : p200 >= 35 ? 45 : p200 >= 20 ? 25 : 10;
  let note = "";
  if (p50 >= p200 + 15) [score, note] = [score + 5, "; 단기 상승 확산(50일선 위 비율이 앞섬)"];
  else if (p50 <= p200 - 15) [score, note] = [score - 5, "; 단기 참여도 하락 전환"];
  return {
    score: clamp(score),
    signal: `알트 ${counted}개 중 ${p200.toFixed(0)}%가 200일선 위 (50일선 위 ${p50.toFixed(0)}%)${note}`,
  };
}

export function fundingRegime(rates: Record<string, number>): { score: number | null; signal: string } {
  const xs = Object.values(rates).filter((r) => Number.isFinite(r));
  if (xs.length < 2 || xs.some((r) => Math.abs(r) > 1)) return noData("데이터 부족: 펀딩비 2종목 이상 필요");
  const avg = mean(xs);
  let score: number;
  let label: string;
  if (avg <= -0.0001) [score, label] = [80, "과매도(음수 펀딩, 숏이 롱에 지불)"];
  else if (avg < 0) [score, label] = [65, "회의적(약한 음수)"];
  else if (avg <= 0.0001) [score, label] = [75, "중립(기준선 부근)"];
  else if (avg <= 0.0003) [score, label] = [55, "롱 레버리지 쌓이는 중"];
  else if (avg <= 0.0006) [score, label] = [30, "롱 쏠림(과열)"];
  else [score, label] = [10, "극단적 과열(연쇄 청산 위험)"];
  const annual = avg * 3 * 365 * 100;
  return { score, signal: `${label}; 평균 ${(avg * 100).toFixed(4)}%/8h (연 환산 약 ${annual.toFixed(1)}%)` };
}

function realizedVol(closes: number[], window: number): number {
  const rets: number[] = [];
  for (let i = closes.length - window + 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) rets.push(Math.log(closes[i]) - Math.log(closes[i - 1]));
  }
  if (rets.length < 2) return 0;
  const m = mean(rets);
  const variance = rets.reduce((a, r) => a + (r - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(Math.max(0, variance)) * Math.sqrt(365);
}

export function drawdownVol(closes: number[]): { score: number | null; signal: string } {
  if (closes.length < 365) return noData("데이터 부족: 일봉 365개 필요");
  const win = closes.slice(-365);
  const high = Math.max(...win);
  const dd = high > 0 ? 1 - win[win.length - 1] / high : 0;
  let score = dd <= 0.1 ? 90 : dd <= 0.2 ? 75 : dd <= 0.35 ? 55 : dd <= 0.5 ? 35 : dd <= 0.65 ? 20 : 10;
  const vols: number[] = [];
  for (let i = 30; i < win.length; i += 7) vols.push(realizedVol(win.slice(0, i + 1), 30));
  const cur = realizedVol(win, 30);
  const pctile = vols.length ? vols.filter((v) => v <= cur).length / vols.length : 0.5;
  let note = "";
  if (pctile <= 1 / 3) [score, note] = [score + 10, "; 변동성 압축(1년 하위 1/3)"];
  else if (pctile >= 2 / 3) [score, note] = [score - 10, "; 변동성 확대(1년 상위 1/3)"];
  if (dd > 0.65 && pctile >= 2 / 3) [score, note] = [Math.max(score, 15), note + "; 투매 구간 하한 적용"];
  return { score: clamp(score), signal: `1년 고점 대비 -${(dd * 100).toFixed(1)}%${note}` };
}

export function momentumThrust(series: Record<string, number[]>): { score: number | null; signal: string } {
  let positive = 0;
  let counted = 0;
  for (const closes of Object.values(series)) {
    if (closes.length < 31) continue;
    counted++;
    if (closes[closes.length - 1] > closes[closes.length - 31]) positive++;
  }
  if (counted < 5) return noData(`데이터 부족: 31일 이상 이력이 있는 코인 ${counted}개 (5개 필요)`);
  const pct = (positive / counted) * 100;
  let score: number;
  let label: string;
  if (pct >= 85) [score, label] = [90, "전면 상승"];
  else if (pct >= 65) [score, label] = [75, "우세"];
  else if (pct >= 45) [score, label] = [55, "혼조"];
  else if (pct >= 25) [score, label] = [35, "약세"];
  else if (pct >= 10) [score, label] = [20, "광범위한 하락"];
  else [score, label] = [35, "투매(거의 전부 하락 — 역발상 가점)"];
  return { score, signal: `${label}: ${counted}개 중 ${pct.toFixed(0)}%가 30일 수익률 양(+)` };
}

export function computeRegime(input: RegimeInput): RegimeResult {
  const withBtc = { BTCUSDT: input.btcCloses, ...input.altCloses };
  const parts: [RegimeComponentId, { score: number | null; signal: string }][] = [
    ["btcTrend", btcTrend(input.btcCloses)],
    ["altBreadth", altBreadth(input.altCloses)],
    ["funding", fundingRegime(input.funding)],
    ["drawdownVol", drawdownVol(input.btcCloses)],
    ["momentum", momentumThrust(withBtc)],
  ];
  const components: RegimeComponent[] = parts.map(([id, r]) => ({
    id,
    label: LABELS[id],
    weight: WEIGHTS[id],
    score: r.score,
    signal: r.signal,
  }));

  const avail = components.filter((c) => c.score !== null);
  const availWeight = avail.reduce((a, c) => a + c.weight, 0);
  if (avail.length < MIN_COMPONENTS || availWeight < MIN_WEIGHT) {
    return { score: null, zone: "UNKNOWN", label: "판단 보류 — 데이터가 충분하지 않음", components };
  }
  const score = Math.round((avail.reduce((a, c) => a + (c.score as number) * c.weight, 0) / availWeight) * 10) / 10;
  const [zone, label] =
    score >= 80
      ? (["RISK_ON", "위험선호 — 전반적으로 우호적, 한도부터 점검"] as const)
      : score >= 40
        ? (["NEUTRAL", "중립 — 뚜렷한 방향 없음"] as const)
        : (["RISK_OFF", "위험회피 — 방어적, 기존 위험 한도 점검"] as const);
  return { score, zone, label, components };
}
