/**
 * GET /api/health
 *  Vercel Serverless Function 動作確認用。常に 200 を返す。
 */
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    runtime: "node",
    nodeVersion: process.version,
    now: new Date().toISOString(),
  });
}
