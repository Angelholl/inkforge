/**
 * 书级落地策略（DEC-2026-1122-01）：books.landing_mandate_json 的类型与 DB 容错读取。
 * mode=off 仅存 {"mode":"off"}（无 heavyEveryN 键）；cadence 时 heavyEveryN 为正整数且 ≥2。
 */
export interface LandingMandate {
  mode: 'off' | 'cadence';
  heavyEveryN?: number;
}

/** DB 容错读取：null/''/非法 JSON/mode 非法 → null（=off）；heavyEveryN 非正整数 → 2 */
export function parseLandingMandate(raw: string | null | undefined): LandingMandate | null {
  if (raw === null || raw === undefined || raw === '') return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const mode = (obj as { mode?: unknown }).mode;
  if (mode === 'off') return { mode: 'off' };
  if (mode !== 'cadence') return null;
  const n = (obj as { heavyEveryN?: unknown }).heavyEveryN;
  const heavyEveryN = typeof n === 'number' && Number.isInteger(n) && n >= 2 ? n : 2;
  return { mode: 'cadence', heavyEveryN };
}
