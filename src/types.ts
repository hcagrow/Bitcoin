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
