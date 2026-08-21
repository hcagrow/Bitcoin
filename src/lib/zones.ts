import type { Zone } from "../types";

export const DEFAULT_ZONES: Zone[] = [
  { id: "z1", min: 0, max: 60000, label: "하락 목표 구간", tone: "위험" },
  { id: "z2", min: 60000, max: 70000, label: "200일선 아래", tone: "경계" },
  { id: "z3", min: 70000, max: 75000, label: "리테스트 확인 구간", tone: "관망" },
  { id: "z4", min: 75000, max: 79000, label: "1차 저항~고점 사이", tone: "긍정" },
  { id: "z5", min: 79000, max: Infinity, label: "신고가 갱신 시도", tone: "과열주의" },
];

const STORAGE_KEY = "btc-app-zones-v1";

export function loadZones(): Zone[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ZONES;
    const parsed = JSON.parse(raw) as Zone[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_ZONES;
    return parsed.map((z) => ({
      ...z,
      max: z.max === null ? Infinity : z.max,
    }));
  } catch {
    return DEFAULT_ZONES;
  }
}

export function saveZones(zones: Zone[]): void {
  const serializable = zones.map((z) => ({
    ...z,
    max: Number.isFinite(z.max) ? z.max : null,
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
}

export function getZone(zones: Zone[], price: number): Zone | undefined {
  return zones
    .slice()
    .sort((a, b) => a.min - b.min)
    .find((z) => price >= z.min && price < z.max);
}
