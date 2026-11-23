import { ALT_UNIVERSE, type RegimeResult } from "../lib/cryptoRegime";

interface Props {
  result: RegimeResult | null;
  loading: boolean;
}

const ZONE_CLASS: Record<RegimeResult["zone"], string> = {
  RISK_ON: "positive",
  NEUTRAL: "hold",
  RISK_OFF: "warning",
  UNKNOWN: "hold",
};

export function CryptoRegimeCard({ result, loading }: Props) {
  if (result === null) {
    return (
      <section className="section">
        <h2>코인 시장 체력</h2>
        <p className="section-sub" role="status">
          {loading ? "알트 시세와 펀딩비를 불러오는 중…" : "데이터를 불러오지 못했습니다."}
        </p>
      </section>
    );
  }
  return (
    <section className="section">
      <h2>코인 시장 체력</h2>
      <div className={`ai-summary-card ${ZONE_CLASS[result.zone]}`}>
        <div className="ai-summary-total">{result.score === null ? "—" : `${result.score} / 100`}</div>
        <p>{result.label}</p>
      </div>
      <table className="entry-table">
        <tbody>
          {result.components.map((c) => (
            <tr key={c.id}>
              <td className="auto-cell">
                <div className="indicator-name">
                  {c.label} <span className="source-tag">{Math.round(c.weight * 100)}%</span>
                </div>
                <div className="indicator-detail">{c.signal}</div>
              </td>
              <td className="badge-cell">{c.score === null ? "미입력" : c.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="section-sub">
        알트 {ALT_UNIVERSE.length}종 일봉과 선물 펀딩비로 계산한 참고 지표입니다. 임계값은 관례값이며 백테스트로 검증된 매매 신호가 아닙니다.
      </p>
    </section>
  );
}
