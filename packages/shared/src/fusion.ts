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
