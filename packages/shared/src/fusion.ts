/**
 * 生成前融合确认门（fusion gate）共享 DTO（规格 docs/design/proposal-2026-11-23-import-reconcile.md v3.1 §3.5）。
 * 门四钉：触发指纹哈希注入面 / 可见降级 / 批量事务确认 / 书级「不再提示」开关。
 */
import type { StyleBindingDto } from './api';

/** A 类剥节行（引擎产物，Task-02 消费） */
export interface FusionAClassRowDto {
  heading: string;
  verdict: 'fully-carried' | 'partially-carried' | 'not-carried';
  preset: 'strip' | 'keep';
  removable: boolean;
  strippableLines: string[];
  residualLines: string[];
  /** 节层级（主审对码修正② 11-24：限段删除段尾=下一「同级或更浅」标题行；缺省按 2）。 */
  level?: 2 | 3;
}

/** 张力行（Task-03 产物） */
export interface TensionRowDto {
  entry: string;
  mdSide: string;
  profileSide: string;
  nature: '拉扯' | '冗余' | '缺口';
  suggestion: string;
  /** 落点三类：dim=该维改跟随档案 / weights=占比挪动 / none=门外无旋钮（DEC-2026-1124-04） */
  lever: 'dim' | 'weights' | 'none';
  /** lever='dim' 时必有：∈ STYLE_DIMENSIONS 六维名（兼容旧名与视角/人称/POV 折算） */
  dim?: string;
  /** lever='weights' 且服务端映射成功时必有：该书已绑集合内按名唯一命中的档案 id */
  profileId?: string;
}

/** GET /fusion-gate 响应 */
export interface FusionGateReportDto {
  action: 'pass' | 'show';
  fingerprint: string;
  aClass: FusionAClassRowDto[];
  previewDescription: string;
  headWindowWarn: boolean;
  hasArchive: boolean;
  binding: {
    styleBinding: StyleBindingDto | null;
    styleFewshotOn: boolean;
    snapshotPresent: boolean;
    plotProfileId: string | null;
    spectrumProfileId: string | null;
    imitationProfileId: string | null;
    /** 档案 id→展示名（style 主辅 + plot/spectrum/imitation 已绑 id；查不到的 id 不进 map）。不入指纹。 */
    profileNames: Record<string, string>;
  };
}

/** POST /fusion-gate/analyze 响应（可见降级钉） */
export interface FusionTensionDto {
  rows: TensionRowDto[];
  degraded: boolean;
  degradeReason?: string;
}

/** POST /fusion-gate/confirm 请求（逐项裁决；undefined=该项不动） */
export interface FusionGateConfirmBody {
  description?: string;
  styleBinding?: {
    primaryProfileId: string;
    auxProfileIds: string[];
    dimsSource: Record<string, string>;
    weights: Record<string, number>;
  };
  imitationProfileId?: string | null;
  plotProfileId?: string | null;
  spectrumProfileId?: string | null;
  suppress?: boolean;
  /** GET 响应原样回传；服务端与当下注入面指纹比对，不一致 → 409 零写。可选=旧客户端兼容。 */
  fingerprint?: string;
}

export interface FusionGateConfirmResult {
  results: {
    description: 'applied' | 'skipped';
    styleBinding: 'applied' | 'skipped';
    plotProfileId: 'applied' | 'skipped';
    spectrumProfileId: 'applied' | 'skipped';
    imitationProfileId: 'applied' | 'skipped';
    suppressed: boolean;
    fingerprintStored: boolean;
  };
  fingerprint: string;
}

/**
 * 张力行「偏档案/偏正文」占比步进（DEC-2026-1124-04）：目标 ±delta、其余按现有比例吸收、
 * 单档最小 1、总和恒 100、越界夹边；空 map 或 id 不在键集 → 浅拷贝原样返回（legacy 不动）。
 * 输入契约：各值为 ≥1 整数（调用方=门内 state 与绑定快照，滑条/校验保证）；函数内不救非法输入。
 */
export function nudgeWeights(weights: Record<string, number>, id: string, delta: number): Record<string, number> {
  const keys = Object.keys(weights);
  if (keys.length === 0 || !(id in weights)) return { ...weights };

  const n = keys.length;
  // 唯一档：其余档无处吸收余额，Σ 恒 100 ⇒ 保持原值（A1c）
  if (n === 1) return { ...weights };
  const target = Math.min(Math.max(weights[id] + delta, 1), 100 - (n - 1));
  const rest = 100 - target;
  const others = keys.filter((k) => k !== id);
  const sumOthers = others.reduce((s, k) => s + weights[k], 0);
  // 其余档下限 1（计划 §nudgeWeights 钉 3）：先给每档保底 1，余额 E=rest−档数 按比例分摊；
  // target 已钳到 100−(n−1) ⇒ E ≥ 0。直接对 rest 做 floor+余数补差会在病态分布
  // （如 90/8/1/1 步 +20）产出 0 档，confirm schema int().min(1) 必 400。
  const E = rest - others.length;
  const rawByKey = new Map<string, number>();
  for (const k of others) rawByKey.set(k, (E * weights[k]) / sumOthers);

  // 键序沿 keys：先按原键序落 1+floor
  const result: Record<string, number> = {};
  for (const k of keys) result[k] = k === id ? target : 1 + Math.floor(rawByKey.get(k)!);

  // deficit 按小数余数降序（平手按 keys 插入序先手，Array.sort 稳定）逐档 +1
  let deficit = E - others.reduce((s, k) => s + (result[k] - 1), 0);
  const byFraction = [...others].sort(
    (a, b) => rawByKey.get(b)! - Math.floor(rawByKey.get(b)!) - (rawByKey.get(a)! - Math.floor(rawByKey.get(a)!)),
  );
  for (let i = 0; deficit > 0; i += 1, deficit -= 1) {
    const k = byFraction[i];
    result[k] = result[k] + 1;
  }
  return result;
}
