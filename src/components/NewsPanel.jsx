import { useEffect, useState } from "react";

/**
 * 「📰 最新ニュース」エリア。
 * /api/news を初回マウント時に 1回 fetch (キャッシュ s-maxage=600 なので軽い)。
 * 失敗時は「未取得」を表示してアプリは動作続行。
 */
export default function NewsPanel() {
  const [state, setState] = useState({ loading: true, items: [], error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/news");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (cancelled) return;
        setState({ loading: false, items: j.items || [], error: null });
      } catch (e) {
        if (cancelled) return;
        setState({ loading: false, items: [], error: String(e?.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state.loading) {
    return (
      <section className="card p-4">
        <h3 className="font-bold text-sm mb-2">📰 最新ニュース</h3>
        <div className="text-xs opacity-70">取得中…</div>
      </section>
    );
  }
  if (state.error) {
    return (
      <section className="card p-4">
        <h3 className="font-bold text-sm mb-2">📰 最新ニュース</h3>
        <div className="text-xs opacity-70">未取得 — {state.error}</div>
      </section>
    );
  }
  if (state.items.length === 0) {
    return (
      <section className="card p-4">
        <h3 className="font-bold text-sm mb-2">📰 最新ニュース</h3>
        <div className="text-xs opacity-70">公式ニュースなし</div>
      </section>
    );
  }

  return (
    <section className="card p-4">
      <h3 className="font-bold text-sm mb-2">📰 最新ニュース ({state.items.length})</h3>
      <div className="text-xs opacity-70 mb-2">boatrace.jp 公式 RSS から自動取得</div>
      <ul className="space-y-2">
        {state.items.slice(0, 10).map((it) => (
          <li key={it.id} className="border-b border-[#1f2a44] pb-2 last:border-b-0">
            <a href={it.link} target="_blank" rel="noopener noreferrer"
              className="block hover:bg-[#162241] rounded p-1">
              <div className="text-sm font-bold text-cyan-300 leading-snug">{it.title}</div>
              <div className="text-xs opacity-60 mt-1 flex flex-wrap gap-2">
                <span>{it.date || "—"}</span>
                <span>·</span>
                <span>{it.source}</span>
                {it.keywords && it.keywords.length > 0 && (
                  <span>·</span>
                )}
                {it.keywords && it.keywords.slice(0, 4).map((k) => (
                  <span key={k} className="pill"
                    style={{
                      background: k.startsWith("pos:") ? "rgba(16,185,129,0.18)"
                                : k.startsWith("neg:") ? "rgba(239,68,68,0.18)"
                                : k.startsWith("venue:") ? "rgba(34,211,238,0.18)"
                                : "rgba(148,163,184,0.18)",
                      color: k.startsWith("pos:") ? "#a7f3d0"
                          : k.startsWith("neg:") ? "#fecaca"
                          : k.startsWith("venue:") ? "#a5f3fc"
                          : "#cbd5e1",
                      fontSize: 10,
                    }}>
                    {k.replace(/^(pos|neg|venue|theme):/, "")}
                  </span>
                ))}
              </div>
              {it.summary && (
                <div className="text-xs opacity-70 mt-1 leading-relaxed">
                  {it.summary.slice(0, 120)}{it.summary.length > 120 ? "…" : ""}
                </div>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
