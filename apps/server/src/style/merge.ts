/**
 * 风格合并模块（DEC-2026-1117-04 规格 B）：把多档案 bundle 合并成单档案形态（MergedStyleProfile，与现单档案注入同形）。
 * 算法钉死（全部确定性，无随机）：
 * 0. 去重防御：auxProfileIds 滤除 primaryProfileId（同一档案不得双计权重与样本）。
 * 1. 七维来源判定：缺键/空串/值 ∉ {主∪辅} → primary（merge 内按 ids 全集解析；normalizeDimsSource 导出为「仅主合法」收窄形态，签名不含辅集合，勿用于多档案归一）。
 * 1'. 共存维（dimsSource[dim]=DIM_SOURCE_COEXIST，DEC-2026-1118-03）：按绑定序（主→辅）收集各档案该维 trim 非空文本、与已收段全等判重跳过，'；' 连接为该维文本；实际贡献=所有被收段档案（可多档案同记）。
 * 2. dims[dim]（单源维）：来源档案该维文本 trim 非空即用并记实际贡献；来源不在 profiles 或文本空 → 回落主档案该维文本（贡献=主）；仍空 → ''（贡献=无）。
 * 3. 权重（双分支，DEC-2026-1117-05）：bundle.weights 键集非空 → 加权路径 w_p=weights[p]（正有限数，缺键/非法=0，主保底废除）；缺席/空对象 → legacy 路径 w_p=实际贡献维数（每维给其贡献档案各 +1，共存维可多档案同加）、主 max(w,1) 保底（改前行为逐字节保留）。第 4/7 步消费方式不变。
 * 4. axes[axis]：参与集合 P = 该轴值为有限数字 且 w_p > 0 的档案；P 空 → 该轴不写入；否则 Math.round(Σ w_p·v / Σ w_p)。
 * 5. rulesText：主原样全量（预算截断归 assembler）；辅逐行 trim 非空、与已收行 trim 相等判重跳过；
 *    追加前置条件 累计长度 + 1 + 行长 ≤ RULES_TOTAL_BUDGET(400)，不满足则 break 当前辅档案行循环、继续下一辅档案。
 * 6. terms：主全收；辅按绑定序逐条 term.trim() 相等判同跳过；总数达 TERMS_MAX(10) 停。
 * 7. samples：席位 = 最大余数法配 SAMPLE_QUOTA(3)（raw_p = 3·w_p/W，floor 后按小数余降序补足，平手主先、再按绑定序）；
 *    顺延循环：while 总席位<3 且存在尚有未取样本的档案：按主→辅绑定序给每个尚有未取样本的档案 +1 席，重复至补满或全池取尽；
 *    每档案 pickStyleSamples(pool, chapterNo, quota_p) 池内轮转；输出 id 加命名空间前缀 `${profileId}:${s.id}`（map 新对象不改池内原对象）；
 *    拼接顺序主在前辅按绑定序；全池空 → []。
 * 8. primaryMetricsJson = profiles[primary]?.metricsJson ?? ''。
 */
import { DIM_SOURCE_COEXIST, STYLE_AXES, STYLE_DIMENSIONS, type StyleAxis, type StyleDimension, type StyleTermDto } from '@inkforge/shared';
import type { Database } from '../db/open';
import { getLatestProfile, type StyleSample } from './distill';
import { pickStyleSamples } from './inject';

export const RULES_TOTAL_BUDGET = 400; // 规格 B：合并 rulesText 总预算（辅补充以 400 封顶）
export const TERMS_MAX = 10; // 规格依据：蒸馏 TERMS 3-10 条惯例（analysis.ts:19）
export const SAMPLE_QUOTA = 3; // 规格 B：fewShot 预算内等比取样总席位（现注入 count=3 惯例）

export interface StyleProfileContent {
  version: number;
  metricsJson: string;
  rulesText: string;
  dims: Partial<Record<StyleDimension, string>>;
  axes: Partial<Record<StyleAxis, number>>;
  terms: StyleTermDto[];
  samples: StyleSample[];
}

export interface StyleBundleV2 {
  v: 2;
  /** 恒 2（buildStyleBundle）；parse 缺省容忍=1 → 无 weights 即 legacy——bundle 冻结的是内容非合并语义 */
  mergeVersion: number;
  boundAt: string;
  primaryProfileId: string;
  auxProfileIds: string[];
  dimsSource: Record<string, string>;
  /** 融合比例（DEC-2026-1117-05）：Record<profileId, 整数≥1>，键集=绑定全集、Σ=100（服务端 zod 保证）；
   *  缺席/空对象=legacy（贡献维数计权+主保底1）。buildStyleBundle 仅在非空对象时写入本键。 */
  weights?: Record<string, number>;
  profiles: Record<string, StyleProfileContent>;
}

export interface MergedStyleProfile {
  primaryProfileId: string;
  primaryMetricsJson: string;
  dims: Record<StyleDimension, string>;
  axes: Partial<Record<StyleAxis, number>>;
  rulesText: string;
  terms: StyleTermDto[];
  samples: StyleSample[];
}

/** 七维逐键归主：签名仅知主档案，故越权值（≠primary）一律归主（缺键/空串同理）；辅档案的合法映射由 mergeStyleProfiles 按 ids 集合自行解析。 */
export function normalizeDimsSource(dimsSource: Record<string, string>, primaryProfileId: string): Record<StyleDimension, string> {
  const out = {} as Record<StyleDimension, string>;
  for (const dim of STYLE_DIMENSIONS) {
    const v = dimsSource?.[dim];
    out[dim] = v === primaryProfileId ? v : primaryProfileId;
  }
  return out;
}

export function buildStyleBundle(input: {
  primaryProfileId: string;
  auxProfileIds: string[];
  dimsSource: Record<string, string>;
  profiles: Record<string, StyleProfileContent>;
  boundAt?: string;
  weights?: Record<string, number>;
}): StyleBundleV2 {
  return {
    v: 2,
    mergeVersion: 2,
    boundAt: input.boundAt ?? new Date().toISOString(),
    primaryProfileId: input.primaryProfileId,
    auxProfileIds: input.auxProfileIds,
    dimsSource: input.dimsSource,
    // legacy 语义由键缺席承载：空/缺省不写 weights 键，序列化后与改前快照逐字节同形
    ...(input.weights && Object.keys(input.weights).length > 0 ? { weights: input.weights } : {}),
    profiles: input.profiles,
  };
}

/** 逐键容错取值：对齐 polish.ts 容错语义——字符串取字符串、对象取对象、数组取数组，否则给空缺省。 */
function tolerantParse(raw: string | undefined | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function tolerantSamples(raw: string | undefined | null): StyleSample[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as StyleSample[]) : [];
  } catch {
    return [];
  }
}

/** 档案行 → 内容（缺键/坏 JSON 容错：rulesText→''、dims/axes→{}、terms→[]、samples→[]，不抛）。 */
export function contentFromProfileRow(row: { version: number; rules_json: string; samples_json: string; metrics_json: string }): StyleProfileContent {
  const rulesData = tolerantParse(row.rules_json);
  const rulesText = typeof rulesData.rulesText === 'string' ? rulesData.rulesText : '';
  const dims = rulesData.dims && typeof rulesData.dims === 'object' && !Array.isArray(rulesData.dims) ? (rulesData.dims as Partial<Record<StyleDimension, string>>) : {};
  const axes = rulesData.axes && typeof rulesData.axes === 'object' && !Array.isArray(rulesData.axes) ? (rulesData.axes as Partial<Record<StyleAxis, number>>) : {};
  const terms = Array.isArray(rulesData.terms) ? (rulesData.terms as StyleTermDto[]) : [];
  return { version: row.version, metricsJson: row.metrics_json, rulesText, dims, axes, terms, samples: tolerantSamples(row.samples_json) };
}

export function parseStyleBundle(raw: string | null | undefined): StyleBundleV2 | undefined {
  if (!raw) return undefined;
  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    obj = parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const primaryProfileId = obj.profileId ?? obj.primaryProfileId;
  if (typeof primaryProfileId !== 'string' || primaryProfileId === '') return undefined;
  const mergeVersion = typeof obj.mergeVersion === 'number' ? obj.mergeVersion : 1;
  const boundAt = typeof obj.boundAt === 'string' ? obj.boundAt : '';
  const auxProfileIds = Array.isArray(obj.auxProfileIds) ? (obj.auxProfileIds as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const dimsSource = obj.dimsSource && typeof obj.dimsSource === 'object' && !Array.isArray(obj.dimsSource) ? (obj.dimsSource as Record<string, string>) : {};
  // weights 容错读：非对象/数组 → undefined（=legacy），V1 适配路径恒无 weights
  const weights = obj.weights && typeof obj.weights === 'object' && !Array.isArray(obj.weights) ? (obj.weights as Record<string, number>) : undefined;

  // V1 旧快照适配：字符串键 rulesJson → 单主 bundle
  if (typeof obj.rulesJson === 'string') {
    const rulesData = tolerantParse(obj.rulesJson as string);
    const content: StyleProfileContent = {
      version: typeof obj.version === 'number' ? obj.version : 1,
      metricsJson: '',
      rulesText: typeof rulesData.rulesText === 'string' ? rulesData.rulesText : '',
      dims: rulesData.dims && typeof rulesData.dims === 'object' && !Array.isArray(rulesData.dims) ? (rulesData.dims as Partial<Record<StyleDimension, string>>) : {},
      axes: rulesData.axes && typeof rulesData.axes === 'object' && !Array.isArray(rulesData.axes) ? (rulesData.axes as Partial<Record<StyleAxis, number>>) : {},
      terms: Array.isArray(rulesData.terms) ? (rulesData.terms as StyleTermDto[]) : [],
      samples: tolerantSamples(typeof obj.samplesJson === 'string' ? obj.samplesJson : undefined),
    };
    return { v: 2, mergeVersion, boundAt, primaryProfileId, auxProfileIds: [], dimsSource: {}, weights: undefined, profiles: { [primaryProfileId]: content } };
  }

  const profiles = obj.profiles && typeof obj.profiles === 'object' && !Array.isArray(obj.profiles) ? (obj.profiles as Record<string, StyleProfileContent>) : {};
  return { v: 2, mergeVersion, boundAt, primaryProfileId, auxProfileIds, dimsSource, weights, profiles };
}

/** 绑定读取：快照优先回落 live 行（快照缺/坏时按单主组装），无绑定/无行 → undefined。 */
export function loadStyleBundle(db: Database, book: { styleProfileId: string | null; styleSnapshotJson: string | null }): StyleBundleV2 | undefined {
  if (!book.styleProfileId) return undefined;
  const parsed = parseStyleBundle(book.styleSnapshotJson);
  if (parsed) return parsed;
  const row = getLatestProfile(db, book.styleProfileId);
  if (!row) return undefined;
  const content = contentFromProfileRow(row);
  return buildStyleBundle({ primaryProfileId: book.styleProfileId, auxProfileIds: [], dimsSource: {}, profiles: { [book.styleProfileId]: content } });
}

export function mergeStyleProfiles(bundle: StyleBundleV2, chapterNo: number): MergedStyleProfile {
  // 0. 去重防御：同一档案不得双计权重与样本
  const primaryProfileId = bundle.primaryProfileId;
  const auxProfileIds = bundle.auxProfileIds.filter((id) => id !== primaryProfileId);
  const profiles = bundle.profiles ?? {};
  const ids = [primaryProfileId, ...auxProfileIds];

  // 1-2. 七维来源判定 + dims 文本（实际贡献记录）：缺键/空串/越权值 → primary（normalizeDimsSource 同语义，此处按 ids 集合放宽合法辅映射）；
  //      共存哨兵 → 按绑定序拼接各档案非空文本（全等段去重，'；' 连接，保持注入单行格式）
  const dims = {} as Record<StyleDimension, string>;
  const contributors = {} as Record<StyleDimension, string[]>;
  const validIds = new Set(ids);
  for (const dim of STYLE_DIMENSIONS) {
    const raw = bundle.dimsSource?.[dim];
    if (raw === DIM_SOURCE_COEXIST) {
      const segs: string[] = [];
      const contrib: string[] = [];
      for (const id of ids) {
        const c = profiles[id];
        const t = c ? (c.dims?.[dim] ?? '').trim() : '';
        if (t === '' || segs.includes(t)) continue;
        segs.push(t);
        contrib.push(id);
      }
      dims[dim] = segs.join('；');
      contributors[dim] = contrib;
      continue;
    }
    const src = typeof raw === 'string' && raw !== '' && validIds.has(raw) ? raw : primaryProfileId;
    const srcContent = profiles[src];
    const srcText = srcContent ? (srcContent.dims?.[dim] ?? '').trim() : '';
    if (srcContent && srcText !== '') {
      dims[dim] = srcText;
      contributors[dim] = [src];
      continue;
    }
    const primaryText = profiles[primaryProfileId] ? (profiles[primaryProfileId].dims?.[dim] ?? '').trim() : '';
    if (primaryText !== '') {
      dims[dim] = primaryText;
      contributors[dim] = [primaryProfileId];
    } else {
      dims[dim] = '';
      contributors[dim] = [];
    }
  }

  // 3. 权重（双分支，DEC-2026-1117-05）：bundle.weights 键集非空 → 加权路径（w_p=正有限数，缺键/非法=0，主保底废除）；
  //    缺席/空对象 → legacy 路径（w_p=实际贡献维数、主 max(w,1) 保底，改前行为逐字节保留）
  const weightsInput = bundle.weights;
  const useWeights = weightsInput != null && Object.keys(weightsInput).length > 0;
  const weights = new Map<string, number>();
  for (const id of ids) weights.set(id, 0);
  if (useWeights) {
    for (const id of ids) {
      const w = weightsInput![id];
      weights.set(id, typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 0);
    }
  } else {
    for (const dim of STYLE_DIMENSIONS) {
      for (const src of contributors[dim]) {
        if (weights.has(src)) weights.set(src, weights.get(src)! + 1);
      }
    }
    weights.set(primaryProfileId, Math.max(weights.get(primaryProfileId) ?? 0, 1));
  }
  const W = ids.reduce((sum, id) => sum + (weights.get(id) ?? 0), 0);

  // 4. 六轴加权：参与需 w_p > 0 且值为有限数字；P 空 → 不写入
  const axes: Partial<Record<StyleAxis, number>> = {};
  for (const axis of STYLE_AXES) {
    let weighted = 0;
    let total = 0;
    for (const id of ids) {
      const w = weights.get(id) ?? 0;
      if (w <= 0) continue;
      const v = profiles[id]?.axes?.[axis];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      weighted += w * v;
      total += w;
    }
    if (total > 0) axes[axis] = Math.round(weighted / total);
  }

  // 5. rulesText：主原样全量；辅逐行去重补充，超总预算 break 当前辅、继续下一辅
  const primaryRules = profiles[primaryProfileId]?.rulesText ?? '';
  const collected = new Set(
    primaryRules
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== ''),
  );
  let rulesText = primaryRules;
  for (const id of auxProfileIds) {
    const lines = (profiles[id]?.rulesText ?? '').split('\n').map((l) => l.trim()).filter((l) => l !== '');
    for (const line of lines) {
      if (collected.has(line)) continue;
      if (rulesText.length + 1 + line.length > RULES_TOTAL_BUDGET) break;
      rulesText += `\n${line}`;
      collected.add(line);
    }
  }

  // 6. terms：主全收；辅 term.trim() 判同跳过；达 TERMS_MAX 停
  const terms: StyleTermDto[] = [...(profiles[primaryProfileId]?.terms ?? [])];
  const termSet = new Set(terms.map((t) => t.term.trim()));
  outer: for (const id of auxProfileIds) {
    for (const t of profiles[id]?.terms ?? []) {
      if (terms.length >= TERMS_MAX) break outer;
      const key = t.term.trim();
      if (termSet.has(key)) continue;
      terms.push(t);
      termSet.add(key);
    }
  }

  // 7. samples：最大余数法配席位 + 顺延循环 + pickStyleSamples 池内轮转 + id 命名空间
  const quota = new Map<string, number>();
  const floors = new Map<string, number>();
  for (const id of ids) {
    const exact = W > 0 ? (SAMPLE_QUOTA * (weights.get(id) ?? 0)) / W : 0;
    floors.set(id, Math.floor(exact));
    quota.set(id, Math.floor(exact));
  }
  let allocated = ids.reduce((sum, id) => sum + (floors.get(id) ?? 0), 0);
  const byRemainder = [...ids].sort((a, b) => {
    const ra = (SAMPLE_QUOTA * (weights.get(a) ?? 0)) / W - (floors.get(a) ?? 0);
    const rb = (SAMPLE_QUOTA * (weights.get(b) ?? 0)) / W - (floors.get(b) ?? 0);
    return rb - ra; // 小数余降序；Array#sort 稳定 → 平手保持主先、再绑定序
  });
  for (const id of byRemainder) {
    if (allocated >= SAMPLE_QUOTA) break;
    quota.set(id, (quota.get(id) ?? 0) + 1);
    allocated += 1;
  }

  const picked = new Map<string, StyleSample[]>();
  let totalPicked = 0;
  for (const id of ids) {
    const pool = profiles[id]?.samples ?? [];
    const q = quota.get(id) ?? 0;
    const got = q > 0 ? pickStyleSamples(pool, chapterNo, q) : [];
    picked.set(id, got);
    totalPicked += got.length;
  }
  // 顺延循环：缺席位按主→辅序给「尚有未取样本」的档案 +1 席，重复至补满或全池取尽
  while (totalPicked < SAMPLE_QUOTA) {
    let progressed = false;
    for (const id of ids) {
      if (totalPicked >= SAMPLE_QUOTA) break;
      const pool = profiles[id]?.samples ?? [];
      const cur = picked.get(id) ?? [];
      if (cur.length < pool.length) {
        const q = cur.length + 1;
        const got = pickStyleSamples(pool, chapterNo, q);
        totalPicked += got.length - cur.length;
        picked.set(id, got);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  const samples = ids.flatMap((id) => (picked.get(id) ?? []).map((s) => ({ ...s, id: `${id}:${s.id}` })));

  // 8. 主 metrics 透传
  const primaryMetricsJson = profiles[primaryProfileId]?.metricsJson ?? '';
  return { primaryProfileId, primaryMetricsJson, dims, axes, rulesText, terms, samples };
}
