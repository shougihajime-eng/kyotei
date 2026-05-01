/**
 * TDZ (Temporal Dead Zone) Audit — Round 49 (改良版)
 *
 * useCallback / useMemo / useEffect の deps 配列が「後ろで定義された変数」 を
 * 参照している箇所を機械的に検出する。
 *
 * 同じ名前が複数の関数スコープで宣言されている場合は、deps 行より「前にある最寄りの宣言」 を採用。
 * (ローカルスコープ変数の同名衝突を誤検知しない)
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const FILES = [];
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".jsx") || e.name.endsWith(".js")) FILES.push(p);
  }
}
walk("src");

let warnings = 0;

for (const file of FILES) {
  const lines = readFileSync(file, "utf8").split("\n");
  // 各名前ごとに、宣言された行番号の配列を集める
  const declMap = {}; // name -> [lineNumber, lineNumber, ...]
  function addDecl(name, line) {
    if (!declMap[name]) declMap[name] = [];
    declMap[name].push(line);
  }
  lines.forEach((line, i) => {
    const m1 = line.match(/^\s*const\s+(\w+)\s*=/);
    const m2 = line.match(/^\s*const\s+\[\s*(\w+)\s*,\s*set\w+\s*\]\s*=/);
    const m3 = line.match(/^\s*function\s+(\w+)\s*\(/);
    const m4 = line.match(/^(?:export\s+)?function\s+(\w+)\s*\(/);
    if (m1) addDecl(m1[1], i + 1);
    if (m2) addDecl(m2[1], i + 1);
    if (m3) addDecl(m3[1], i + 1);
    if (m4) addDecl(m4[1], i + 1);
  });
  // useCallback / useMemo / useEffect の deps 配列を検査
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s*}\s*,\s*\[(.*)\]\s*\)\s*;?\s*$/);
    if (!m) continue;
    const useLine = i + 1;
    const deps = m[1].split(",").map(s => s.trim()).filter(Boolean);
    for (const dep of deps) {
      const root = dep.split(/[.\s]/)[0];
      if (!root || /^[\d"']/.test(root)) continue;
      const allDecls = declMap[root] || [];
      // useLine より前にある宣言を探す
      const beforeDecls = allDecls.filter(d => d < useLine);
      if (beforeDecls.length === 0 && allDecls.length > 0) {
        // 全ての宣言が useLine より後ろ → TDZ
        warnings++;
        console.log(`⚠️ TDZ: ${file}:${useLine}`);
        console.log(`   deps "${root}" の宣言が deps 行より後ろ (${allDecls.join(", ")})`);
        console.log(`   該当行: ${line.trim()}`);
      }
      // 同名宣言が deps 前にもあれば OK (前のスコープのものを使うはず)
    }
  }
}

console.log(`\n========== TDZ Audit 結果 ==========`);
if (warnings === 0) {
  console.log("✅ TDZ リスク 検出なし — 全コンポーネント OK");
  process.exit(0);
} else {
  console.log(`❌ ${warnings} 件の TDZ リスクを検出 (上を確認)`);
  process.exit(1);
}
