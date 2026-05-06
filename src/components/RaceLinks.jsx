import { useMemo } from "react";
import { buildRaceLinks } from "../lib/raceLinks.js";

/**
 * Round 108: 出走表 / リプレイ / 結果 へのワンタップ導線
 *
 * UX 設計:
 *   ・ボタン高 36px+ (スマホでも押しやすい)
 *   ・外部リンクは _blank + noopener
 *   ・リプレイ未公開時は disabled + 「リプレイ準備中」 で混乱を防ぐ
 *   ・押下時は scale 0.98 + active 色で「反応した」感を確実に
 *   ・タイトル属性で会場 + 日付 + Rno を表示 (どのレースか間違えない)
 *
 * 使い方:
 *   <RaceLinks race={{ date, venue, jcd, raceNo, startTime }} />
 *   <RaceLinks race={r} compact />            // 小さい場面 (チップ)
 *   <RaceLinks race={r} showLabel={false} />  // ラベル無し
 */
export default function RaceLinks({
  race,
  compact = false,
  showLabel = true,
  showResult = false,
  showMeta = true,
  align = "left", // left | right | center
  className = "",
  style = {},
}) {
  const links = useMemo(() => buildRaceLinks(race), [race]);

  if (!race) return null;

  const fontSize = compact ? 11.5 : 12.5;
  const minHeight = compact ? 32 : 36;
  const padding = compact ? "5px 10px" : "7px 12px";
  const radius = compact ? 8 : 10;
  const gap = compact ? 6 : 8;

  const justify = align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start";

  return (
    <div
      className={"race-links " + className}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: justify,
        gap,
        ...style,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* === メタ情報: どのレースか === */}
      {showMeta && showLabel && (
        <span
          className="race-links-meta num"
          style={{
            fontSize: 10.5,
            color: "var(--text-tertiary)",
            letterSpacing: "0.02em",
            fontWeight: 600,
            marginRight: 2,
          }}
        >
          {formatMeta(race)}
        </span>
      )}

      {/* === 出走表 === */}
      <LinkPill
        href={links.raceCardUrl}
        disabled={!links.raceCardUrl}
        icon="📋"
        label="出走表"
        title={links.raceCardUrl
          ? `${race.venue || ""} ${race.raceNo || "?"}R の出走表を別タブで開く`
          : (links.reason || "URL を生成できませんでした")}
        fontSize={fontSize}
        minHeight={minHeight}
        padding={padding}
        radius={radius}
        accent="var(--brand)"
        accentRgba="rgba(34, 211, 238,"
      />

      {/* === リプレイ ===
          公式は per-race deep link を出さないため、 race.boatcast.jp の
          会場 + 日付ページへ遷移して、 ユーザーが SPA 内で R 番号選択する想定 */}
      <LinkPill
        href={links.replayUrl}
        disabled={!links.replayUrl}
        icon="🎬"
        label={links.replayPending ? "リプレイ準備中" : "リプレイ"}
        title={links.replayUrl
          ? `${race.venue || ""} ${formatDate(race.date)} のリプレイ一覧を別タブで開く (${race.raceNo || "?"}R を選択してください)`
          : (links.replayPending ? "レース終了後 30 分目安でご利用可能になります" : "URL を生成できません")}
        fontSize={fontSize}
        minHeight={minHeight}
        padding={padding}
        radius={radius}
        accent="#A78BFA"
        accentRgba="rgba(167, 139, 250,"
      />

      {/* === 結果 (オプション) === */}
      {showResult && (
        <LinkPill
          href={links.resultUrl}
          disabled={!links.resultUrl}
          icon="🏁"
          label="結果"
          title={links.resultUrl ? "公式の確定結果ページを開く" : "URL を生成できませんでした"}
          fontSize={fontSize}
          minHeight={minHeight}
          padding={padding}
          radius={radius}
          accent="var(--c-success)"
          accentRgba="rgba(16, 185, 129,"
        />
      )}
    </div>
  );
}

/* === レースのメタ表記 === */
function formatMeta(race) {
  const parts = [];
  if (race.date) parts.push(formatDate(race.date));
  if (race.venue) parts.push(race.venue);
  if (race.raceNo) parts.push(`${race.raceNo}R`);
  return parts.join(" · ");
}

function formatDate(date) {
  if (!date) return "";
  const s = String(date).trim();
  // "YYYY-MM-DD" → "M/D"
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${+m[2]}/${+m[3]}`;
  if (/^\d{8}$/.test(s)) return `${+s.slice(4, 6)}/${+s.slice(6, 8)}`;
  return s;
}

/* === 個別 リンクピル ===
   disabled 時: muted color + cursor not-allowed
   active 時: cyan/purple/green に応じた gradient + lift */
function LinkPill({
  href,
  disabled,
  icon,
  label,
  title,
  fontSize,
  minHeight,
  padding,
  radius,
  accent,
  accentRgba,
}) {
  const baseStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding,
    minHeight,
    borderRadius: radius,
    fontSize,
    fontWeight: 700,
    letterSpacing: "0.01em",
    transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
    textDecoration: "none",
    whiteSpace: "nowrap",
    userSelect: "none",
  };

  if (disabled) {
    return (
      <span
        title={title}
        aria-disabled="true"
        style={{
          ...baseStyle,
          color: "var(--text-tertiary)",
          background: "rgba(255, 255, 255, 0.025)",
          border: "1px solid var(--border-soft)",
          cursor: "not-allowed",
          opacity: 0.65,
        }}
      >
        <span style={{ fontSize: fontSize - 0.5 }}>{icon}</span>
        <span>{label}</span>
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.97)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = ""; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; }}
      onTouchStart={(e) => { e.currentTarget.style.transform = "scale(0.97)"; }}
      onTouchEnd={(e) => { e.currentTarget.style.transform = ""; }}
      style={{
        ...baseStyle,
        color: accent,
        background: `linear-gradient(180deg, ${accentRgba} 0.14) 0%, ${accentRgba} 0.06) 100%)`,
        border: `1px solid ${accentRgba} 0.40)`,
        boxShadow: `0 0 0 1px ${accentRgba} 0.12) inset, 0 1px 2px rgba(0, 0, 0, 0.20)`,
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: fontSize - 0.5 }}>{icon}</span>
      <span>{label}</span>
      <span aria-hidden="true" style={{ fontSize: fontSize - 2, opacity: 0.65, marginLeft: 1 }}>↗</span>
    </a>
  );
}
