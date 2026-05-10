/**
 * 万舟研究所 — 研究所タブ (Round 164 / Phase 2)
 *
 * ・荒れスコアの精度を見える化 (75+ で何 % が実際に荒れたか)
 * ・見送ったレースで万舟が出た 「取りこぼし」 を一覧化
 * ・各成分 (進入/風/1号艇/攻め手/展示/オッズ) の効きを集計
 * ・重み補正の提案を表示 (実装は研究者 = ユーザー判断、自動補正は別途)
 */
import { useMemo, useState, useEffect } from "react";
import { analyzeMansyuLearning, findMissedRoughRaces } from "../lib/mansyuLearning.js";
import {
  loadMansyuWeights, saveMansyuWeights, resetMansyuWeights,
  applyRecommendation, applyAllRecommendations,
  MANSYU_WEIGHT_DEFAULTS,
} from "../lib/mansyuWeights.js";
import { setMansyuWeights } from "../lib/mansyu.js";

export default function MansyuLab({ predictions, races }) {
  const learning = useMemo(() => analyzeMansyuLearning(predictions, races), [predictions, races]);
  const missed = useMemo(() => findMissedRoughRaces(predictions, races), [predictions, races]);
  const [weights, setWeights] = useState(() => loadMansyuWeights());

  function handleApplyOne(rec) {
    const next = applyRecommendation(rec, weights);
    setWeights(next);
    saveMansyuWeights(next);
    setMansyuWeights(next);
  }
  function handleApplyAll() {
    const next = applyAllRecommendations(learning.recommendations || [], weights);
    setWeights(next);
    saveMansyuWeights(next);
    setMansyuWeights(next);
  }
  function handleReset() {
    resetMansyuWeights();
    setWeights({ ...MANSYU_WEIGHT_DEFAULTS });
    setMansyuWeights({ ...MANSYU_WEIGHT_DEFAULTS });
  }
  // 重みは scoreMansyu のグローバル現在値にも反映する (App 起動時に load 済の想定)
  useEffect(() => { setMansyuWeights(weights); }, [weights]);

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "12px clamp(8px, 3vw, 16px) 0" }}>
      {/* ===== ヘッダ ===== */}
      <div style={{
        background: "linear-gradient(135deg, #0a0e1a 0%, #15172a 100%)",
        border: "1.5px solid rgba(251, 191, 36, 0.30)",
        borderRadius: 14,
        padding: "14px 16px",
        marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🔬</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#FBBF24" }}>
              万舟研究所 / 研究データ
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              荒れスコアが効いているか / 見送りが正解だったか / 取りこぼしを発見
            </div>
          </div>
        </div>
        {learning?.summary && (
          <div style={{
            marginTop: 10, padding: "8px 10px", borderRadius: 8,
            background: "rgba(34, 211, 238, 0.06)",
            border: "1px solid rgba(34, 211, 238, 0.20)",
            color: "#cbd5e1", fontSize: 12, lineHeight: 1.6,
          }}>
            📊 {learning.summary}
          </div>
        )}
      </div>

      {/* ===== サンプル不足 ===== */}
      {!learning.ready && (
        <EmptyCard
          title={`データが ${learning.sampleSize} 件 (5 件以上で簡易分析、 10 件以上で安定)`}
          body="レース結果を蓄積中です。 荒れる時だけ予想する仕様のため、 5 場で 1〜2 週間データを貯めると分析できるようになります。"
        />
      )}

      {/* ===== 学習サマリ (KPI 3 box) ===== */}
      {learning.ready && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 8,
          marginBottom: 14,
        }}>
          <Kpi
            label="🎯 見立て的中率"
            value={learning.overHitRate != null ? `${Math.round(learning.overHitRate * 100)}%` : "—"}
            sub={`${learning.skipAnalysis.overScoredAndRough}/${learning.skipAnalysis.overScored} レース`}
            color={learning.overHitRate >= 0.6 ? "#22F5A8" : learning.overHitRate >= 0.4 ? "#FCD34D" : "#F87171"}
            tooltip="荒れスコア 75+ で表示したレースのうち、 実際に荒れた (3 連単 ≥ 5,000 円) 割合"
          />
          <Kpi
            label="✅ 見送り正答率"
            value={learning.skipCorrectRate != null ? `${Math.round(learning.skipCorrectRate * 100)}%` : "—"}
            sub={`${learning.skipAnalysis.correctSkip}/${learning.skipAnalysis.underScored} レース`}
            color={learning.skipCorrectRate >= 0.7 ? "#22F5A8" : learning.skipCorrectRate >= 0.5 ? "#FCD34D" : "#F87171"}
            tooltip="荒れスコア 75 未満で見送ったレースのうち、 実際も荒れず (1 号艇逃げ + 中穴未満) で正解だった割合"
          />
          <Kpi
            label="⚠️ 取りこぼし"
            value={learning.skipAnalysis.underScoredButMansyu}
            sub="件 (見送りで万舟)"
            color={learning.skipAnalysis.underScoredButMansyu === 0 ? "#22F5A8" : learning.skipAnalysis.underScoredButMansyu <= 2 ? "#FCD34D" : "#F87171"}
            tooltip="荒れスコアが低くて見送ったが、 実際は万舟 (3 連単 ≥ 10,000 円) が出てしまったレース数"
          />
        </div>
      )}

      {/* ===== 現在の重み + リセット ===== */}
      <Section
        title="⚙️ 現在の重み係数"
        subtitle="既定 1.0 / 範囲 0.5〜1.5 / 補正後は荒れスコア計算に即座に反映"
      >
        <div style={{
          padding: "10px 12px", borderRadius: 10,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(148, 163, 184, 0.20)",
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 6,
          }}>
            {[
              { k: "entry",      label: "進入不安" },
              { k: "weather",    label: "強風・波" },
              { k: "leader",     label: "1号艇不安" },
              { k: "attackers",  label: "攻め手存在" },
              { k: "exhibition", label: "展示異変" },
              { k: "odds",       label: "オッズ妙味" },
            ].map((x) => {
              const v = weights[x.k] || 1;
              const isUp = v > 1.001;
              const isDown = v < 0.999;
              const color = isUp ? "#22F5A8" : isDown ? "#F87171" : "#94a3b8";
              return (
                <div key={x.k} style={{
                  padding: "6px 8px", borderRadius: 8,
                  background: "rgba(0,0,0,0.20)",
                  border: `1px solid ${color}30`,
                }}>
                  <div style={{ fontSize: 11, color: "#cbd5e1", fontWeight: 700 }}>{x.label}</div>
                  <div className="num" style={{ fontSize: 16, fontWeight: 800, color, marginTop: 2 }}>
                    {isUp ? "🔼 " : isDown ? "🔽 " : ""}×{v.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
            <button onClick={handleReset} style={{
              padding: "6px 14px", borderRadius: 8,
              background: "rgba(148, 163, 184, 0.10)",
              border: "1px solid rgba(148, 163, 184, 0.40)",
              color: "#cbd5e1", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}>
              ⟲ デフォルトに戻す
            </button>
          </div>
        </div>
      </Section>

      {/* ===== 重み補正の提案 ===== */}
      {learning.ready && learning.recommendations.length > 0 && (
        <Section title="🎚️ 重み補正の提案" subtitle="各成分が「効いてるか」 を集計し、 補正案を出します。 「適用」 で即座に反映">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {learning.recommendations.map((r, i) => (
              <div key={i} style={{
                padding: "10px 12px", borderRadius: 10,
                background: r.kind === "boost" ? "rgba(34, 245, 168, 0.08)"
                          : r.kind === "reduce" ? "rgba(245, 158, 11, 0.08)"
                          : "rgba(248, 113, 113, 0.08)",
                border: `1px solid ${r.kind === "boost" ? "rgba(34, 245, 168, 0.30)"
                                  : r.kind === "reduce" ? "rgba(245, 158, 11, 0.30)"
                                  : "rgba(248, 113, 113, 0.30)"}`,
                color: r.kind === "boost" ? "#A7F3D0"
                     : r.kind === "reduce" ? "#FDE68A"
                     : "#FECACA",
                fontSize: 12.5, lineHeight: 1.6,
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              }}>
                <span style={{ flex: "1 1 240px" }}>
                  {r.kind === "boost" ? "🔼 " : r.kind === "reduce" ? "🔽 " : "↩️ "}
                  {r.message}
                </span>
                <button onClick={() => handleApplyOne(r)} style={{
                  padding: "5px 12px", borderRadius: 8,
                  background: "rgba(255,255,255,0.10)",
                  border: "1px solid rgba(255,255,255,0.30)",
                  color: "inherit", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  whiteSpace: "nowrap",
                }}>
                  ✅ 適用
                </button>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
              <button onClick={handleApplyAll} style={{
                padding: "7px 16px", borderRadius: 10,
                background: "linear-gradient(180deg, #FBBF24 0%, #F59E0B 100%)",
                border: "1px solid rgba(251, 191, 36, 0.50)",
                color: "#451A03", fontSize: 12.5, fontWeight: 800, cursor: "pointer",
                boxShadow: "0 2px 8px rgba(251, 191, 36, 0.25)",
              }}>
                🎯 全て適用
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, paddingLeft: 4 }}>
              ※ 適用すると localStorage に保存され、 次回以降の荒れスコア計算に反映されます。
              「デフォルトに戻す」 でいつでも元に戻せます。
            </div>
          </div>
        </Section>
      )}

      {/* ===== 各成分の階級別 荒れ率 ===== */}
      {learning.ready && learning.components && (
        <Section title="📊 成分別 荒れ率" subtitle="高 (70%↑) / 中 (40-69%) / 低 (40%-) のスコアごとの荒れ率">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Object.entries(learning.components).map(([key, c]) => {
              const tiers = [
                { name: "高", data: c.high, color: "#DC2626" },
                { name: "中", data: c.mid,  color: "#F59E0B" },
                { name: "低", data: c.low,  color: "#475569" },
              ];
              return (
                <div key={key} style={{
                  padding: "8px 12px", borderRadius: 8,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(148, 163, 184, 0.15)",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#cbd5e1", marginBottom: 6 }}>
                    {c.label}
                    <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8, fontWeight: 500 }}>
                      (max {c.max})
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {tiers.map((t) => {
                      const rate = t.data.count > 0 ? t.data.rough / t.data.count : null;
                      return (
                        <div key={t.name} style={{
                          flex: "1 1 110px",
                          padding: "6px 10px", borderRadius: 6,
                          background: "rgba(0,0,0,0.20)",
                          border: `1px solid ${t.color}40`,
                        }}>
                          <div style={{ fontSize: 11, color: t.color, fontWeight: 700 }}>
                            {t.name}スコア
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9", marginTop: 2 }}>
                            {rate != null ? `${Math.round(rate * 100)}%` : "—"}
                            <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 4, fontWeight: 500 }}>
                              ({t.data.rough}/{t.data.count})
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ===== 取りこぼし (見送りで万舟) ===== */}
      {missed.length > 0 && (
        <Section
          title={`⚠️ 取りこぼし — 見送りで万舟が出たレース (${missed.length} 件)`}
          subtitle="荒れスコアが低かったが実際は荒れた / 万舟が出た — 学習材料"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {missed.slice(0, 12).map((m, i) => (
              <MissedRow key={i} entry={m} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/* === KPI box === */
function Kpi({ label, value, sub, color, tooltip }) {
  return (
    <div title={tooltip} style={{
      padding: "10px 12px", borderRadius: 12,
      background: "rgba(255,255,255,0.02)",
      border: "1.5px solid " + (color || "rgba(148, 163, 184, 0.30)"),
      minHeight: 76,
    }}>
      <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.04em", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, color, marginTop: 4, letterSpacing: "0.01em" }}>
        {value}
      </div>
      <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

/* === セクション === */
function Section({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ marginBottom: 6, padding: "0 4px" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0", letterSpacing: "0.02em" }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

/* === からっぽカード === */
function EmptyCard({ title, body }) {
  return (
    <div style={{
      padding: "24px 16px",
      textAlign: "center",
      borderRadius: 14,
      background: "rgba(255,255,255,0.02)",
      border: "1px dashed rgba(148, 163, 184, 0.25)",
      color: "#94a3b8",
    }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🔬</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#cbd5e1", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

/* === 取りこぼし 1 行 === */
function MissedRow({ entry }) {
  const { prediction: p, mansyu, result } = entry;
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 10,
      background: "rgba(248, 113, 113, 0.06)",
      border: "1px solid rgba(248, 113, 113, 0.25)",
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
    }}>
      <div style={{ flex: "0 0 auto", minWidth: 80 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9" }}>
          {p.venue} <span style={{ color: "#FCD34D" }}>{p.raceNo}R</span>
        </div>
        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{p.date}</div>
      </div>
      <div style={{ flex: "0 0 auto" }}>
        <div style={{ fontSize: 10, color: "#94a3b8" }}>荒れスコア</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#94a3b8" }}>
          {mansyu.score}
        </div>
      </div>
      <div style={{ flex: "0 0 auto" }}>
        <div style={{ fontSize: 10, color: "#94a3b8" }}>正解</div>
        <div className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: "#FCD34D" }}>
          {p.result.first}-{p.result.second}-{p.result.third}
        </div>
      </div>
      <div style={{ flex: "1 1 auto", minWidth: 80, textAlign: "right" }}>
        <div style={{ fontSize: 10, color: "#94a3b8" }}>3 連単配当</div>
        <div style={{ fontSize: 16, fontWeight: 900, color: "#F87171" }}>
          ¥{result.trifectaPayout.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
