/**
 * 研究所タブの概要・案内 (Round 176 / SPEC §6.1)
 *
 * 上から順に:
 *   ① 上級者向け注意バナー (一般ユーザーは触らなくて OK)
 *   ② 学習履歴カード (Round 172/172.5 の自動学習ログを表示)
 *   ③ Coming soon 予告 (Round 178-180 場別ランキング / Round 182 細粒度学習)
 *
 * SPEC §6.1.1 の中身一覧と整合する形で並べる。
 */
import { useEffect, useState } from "react";
import { getLearningHistory } from "../lib/mansyuLearningAuto.js";

export default function ResearchOverview() {
  const [history, setHistory] = useState([]);
  useEffect(() => {
    setHistory(getLearningHistory());
  }, []);

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "12px clamp(8px, 3vw, 16px) 0" }}>

      {/* ① 上級者向け注意バナー */}
      <div style={{
        padding: "12px 14px",
        borderRadius: 10,
        background: "rgba(251, 191, 36, 0.08)",
        border: "1px solid rgba(251, 191, 36, 0.30)",
        marginBottom: 14,
        fontSize: 12.5, lineHeight: 1.6,
        color: "#FCD34D",
      }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>🔬 ここは上級者向けの研究所です</div>
        <div style={{ color: "#fef3c7", fontWeight: 500 }}>
          普段はホーム画面だけで OK です。 「なぜこの判定か」 「学習はどう動いているか」 を深掘りしたい時だけ覗いてください。
        </div>
      </div>

      {/* ② 学習履歴カード (Round 172/172.5) */}
      <LearningHistoryCard history={history} />

      {/* ③ Coming soon 予告 */}
      <ComingSoonCard />

    </div>
  );
}

/* ===== 学習履歴カード ===== */
function LearningHistoryCard({ history }) {
  const recent = history.slice(0, 5);
  return (
    <section style={{
      padding: "16px 18px",
      borderRadius: 12,
      background: "linear-gradient(180deg, rgba(34, 211, 238, 0.06) 0%, rgba(15, 23, 42, 0.40) 100%)",
      border: "1.5px solid rgba(34, 211, 238, 0.30)",
      marginBottom: 14,
    }}>
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        marginBottom: 10, gap: 8, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#67E8F9", letterSpacing: "0.02em" }}>
          🤖 学習履歴 (直近 5 件)
        </div>
        <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600 }}>
          1 日 1 回 自動チェック
        </div>
      </div>

      {recent.length === 0 ? (
        <div style={{
          padding: "16px 12px", textAlign: "center",
          fontSize: 13, color: "#94A3B8", lineHeight: 1.6,
        }}>
          まだ学習履歴がありません。<br/>
          <span style={{ fontSize: 11.5, opacity: 0.85 }}>
            荒れスコア 75 点未満で見送ったレースの結果が 10 件以上溜まると、 自動で重み調整が動き始めます。
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recent.map((h, i) => (
            <HistoryRow key={i} entry={h} />
          ))}
        </div>
      )}

      <div style={{
        marginTop: 10, padding: "8px 10px",
        background: "rgba(0,0,0,0.30)", borderRadius: 8,
        fontSize: 11, color: "#94A3B8", lineHeight: 1.55,
      }}>
        💡 仕組み: 自動学習 (1 日 1 回) → 重み適用 → 7-14 日後に効果検証 → 悪化していたら自動ロールバック (前重みに戻す)
      </div>
    </section>
  );
}

function HistoryRow({ entry }) {
  const ts = entry.ts ? new Date(entry.ts).toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit" }) : "—";
  const meta = KIND_META[entry.kind] || { icon: "•", color: "#94A3B8", label: entry.kind };
  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 8,
      background: "rgba(0,0,0,0.30)",
      borderLeft: `3px solid ${meta.color}`,
      display: "flex", gap: 10, alignItems: "flex-start",
    }}>
      <div style={{ fontSize: 18, lineHeight: 1, flex: "0 0 auto" }}>{meta.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 2, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: meta.color, fontWeight: 800, letterSpacing: "0.02em" }}>
            {meta.label}
          </span>
          <span style={{ fontSize: 11, color: "#94A3B8" }}>{ts}</span>
        </div>
        <div style={{ fontSize: 12.5, color: "#cbd5e1", lineHeight: 1.5 }}>
          {entry.reason || entry.message || "—"}
        </div>
      </div>
    </div>
  );
}

const KIND_META = {
  applied:    { icon: "✅", color: "#67E8F9", label: "自動適用" },
  rolledback: { icon: "🔄", color: "#FCA5A5", label: "ロールバック" },
  kept:       { icon: "👍", color: "#86EFAC", label: "効果検証 OK" },
  skipped:    { icon: "⏭", color: "#94A3B8", label: "スキップ" },
  stopped:    { icon: "⛔", color: "#FDE68A", label: "学習停止" },
};

/* ===== Coming soon カード ===== */
function ComingSoonCard() {
  const items = [
    {
      icon: "🏆",
      title: "場別 モーター TOP10",
      desc: "5 場ごとに 2連率/3連率/直近/展示気配/上昇傾向 を AI 評価したランキング (Round 179)",
    },
    {
      icon: "🏅",
      title: "場別 選手 TOP10",
      desc: "ST/コース別/モーター相性/会場相性 を AI 評価したランキング — 「会場巧者」 を発見 (Round 180)",
    },
    {
      icon: "🧠",
      title: "細粒度学習 (場別/モーター別/選手別)",
      desc: "全データ 1 セットの重みから、 場・モーター・選手ごとの個別重みへ進化 (Round 182)",
    },
    {
      icon: "🔭",
      title: "ディープラーニング",
      desc: "データが 1,000 件以上溜まったら検討 (Round 200 想定)",
    },
  ];
  return (
    <section style={{
      padding: "16px 18px",
      borderRadius: 12,
      background: "rgba(255,255,255,0.02)",
      border: "1px dashed rgba(148, 163, 184, 0.35)",
      marginBottom: 14,
    }}>
      <div style={{
        fontSize: 14, fontWeight: 800, color: "#cbd5e1",
        letterSpacing: "0.02em", marginBottom: 4,
      }}>
        🚧 Coming soon
      </div>
      <div style={{ fontSize: 11.5, color: "#94A3B8", marginBottom: 12, lineHeight: 1.5 }}>
        SPEC §9 ロードマップに従って実装予定。 完成順にここから消えていきます。
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it, i) => (
          <div key={i} style={{
            padding: "10px 12px", borderRadius: 8,
            background: "rgba(0,0,0,0.20)",
            display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <div style={{ fontSize: 18, lineHeight: 1, flex: "0 0 auto" }}>{it.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 700, marginBottom: 2 }}>
                {it.title}
              </div>
              <div style={{ fontSize: 11.5, color: "#94A3B8", lineHeight: 1.55 }}>
                {it.desc}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
