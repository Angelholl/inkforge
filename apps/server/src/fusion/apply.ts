/**
 * 融合门确认批量写（Task-04；规格 docs/design/proposal-2026-11-23-import-reconcile.md v3.1 §3.5）。
 * 所有库内写包进单一 better-sqlite3 事务：天然无半写、任一失败全回滚；
 * gen_gate 指纹写在事务提交后——写失败不吞，返回 fingerprintStored:false（宁重弹不误直通）。
 * description 写恒最先（故障注入回滚覆盖锚点）。写语义全部复用既有 repo 函数（写入口一致性钉）。
 */
import type { FusionGateConfirmResult } from '@inkforge/shared';
import type { Database } from '../db/open';
import * as booksRepo from '../db/repositories/books';
import * as imitationRepo from '../db/repositories/imitation';
import * as plotRepo from '../db/repositories/plot';
import * as spectrumRepo from '../db/repositories/spectrum';
import { buildStyleBundle, contentFromProfileRow, type StyleProfileContent } from '../style/merge';
import { injectionFaceFingerprint, type InjectionFace } from './fingerprint';

/** 同 shared FusionGateConfirmBody（undefined=该项不动）。 */
export interface ConfirmDecisions {
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

export interface ConfirmOutcome {
  results: FusionGateConfirmResult['results'];
  fingerprint: string;
  fingerprintStored: boolean;
}

/** 单一事务批量写 + 事务后指纹写。存在性校验全在事务体内，抛错即全回滚。 */
export function applyFusionConfirm(
  db: Database,
  bookId: string,
  decisions: ConfirmDecisions,
  face: InjectionFace,
): ConfirmOutcome {
  const results: FusionGateConfirmResult['results'] = {
    description: 'skipped',
    styleBinding: 'skipped',
    plotProfileId: 'skipped',
    spectrumProfileId: 'skipped',
    imitationProfileId: 'skipped',
    suppressed: decisions.suppress === true,
    fingerprintStored: false,
  };

  const write = db.transaction(() => {
    // 锚点：description 恒最先写；后续任一存在性校验抛错都会把它一并回滚。
    if (decisions.description !== undefined) {
      booksRepo.updateBookMeta(db, bookId, { description: decisions.description });
      results.description = 'applied';
    }

    if (decisions.styleBinding !== undefined) {
      const { primaryProfileId, auxProfileIds, dimsSource, weights } = decisions.styleBinding;
      // 逐 id 存在性（事务体内；缺 → throw → 全回滚）——与 PUT /style 同构复用（写入口一致性钉）
      const profiles: Record<string, StyleProfileContent> = {};
      for (const id of [primaryProfileId, ...auxProfileIds]) {
        const row = db
          .prepare('SELECT id, version, rules_json, samples_json, metrics_json FROM style_profiles WHERE id = ?')
          .get(id) as { id: string; version: number; rules_json: string; samples_json: string; metrics_json: string } | undefined;
        if (!row) throw new Error(`profile not found: ${id}`);
        profiles[id] = contentFromProfileRow(row);
      }
      const bundle = buildStyleBundle({
        primaryProfileId,
        auxProfileIds,
        dimsSource,
        profiles,
        weights: Object.keys(weights).length > 0 ? weights : undefined,
      });
      booksRepo.setBookStyleBinding(db, bookId, { primaryProfileId, auxProfileIds, dimsSource, weights }, JSON.stringify(bundle));
      results.styleBinding = 'applied';
    }

    // 三类 planner 绑定：存在性校验同样在事务体内（缺 → throw → 全回滚）
    if (decisions.plotProfileId !== undefined) {
      if (decisions.plotProfileId !== null && !plotRepo.getPlotProfile(db, decisions.plotProfileId)) {
        throw new Error(`profile not found: ${decisions.plotProfileId}`);
      }
      booksRepo.setBookPlotProfile(db, bookId, decisions.plotProfileId);
      results.plotProfileId = 'applied';
    }
    if (decisions.spectrumProfileId !== undefined) {
      if (decisions.spectrumProfileId !== null && !spectrumRepo.getSpectrumProfile(db, decisions.spectrumProfileId)) {
        throw new Error(`profile not found: ${decisions.spectrumProfileId}`);
      }
      booksRepo.setBookSpectrumProfile(db, bookId, decisions.spectrumProfileId);
      results.spectrumProfileId = 'applied';
    }
    if (decisions.imitationProfileId !== undefined) {
      if (decisions.imitationProfileId !== null && !imitationRepo.getImitationProfile(db, decisions.imitationProfileId)) {
        throw new Error(`profile not found: ${decisions.imitationProfileId}`);
      }
      booksRepo.setBookImitation(db, bookId, decisions.imitationProfileId);
      results.imitationProfileId = 'applied';
    }
  });
  write();

  // 指纹真值=写后实际注入面（含 styleBinding 写后 getBookStyleBinding、fewshot 随绑定翻转等 repo 语义）。
  const written = booksRepo.getBook(db, bookId);
  const finalFace: InjectionFace = {
    ...face,
    description: written?.description ?? face.description,
    styleBinding: booksRepo.getBookStyleBinding(db, bookId),
    styleFewshotOn: written?.styleFewshotOn ?? face.styleFewshotOn,
    styleSnapshotJson: written?.styleSnapshotJson ?? face.styleSnapshotJson,
    plotProfileId: written?.plotProfileId ?? face.plotProfileId,
    spectrumProfileId: written?.spectrumProfileId ?? face.spectrumProfileId,
    imitationProfileId: written?.imitationProfileId ?? face.imitationProfileId,
  };
  const fingerprint = injectionFaceFingerprint(finalFace);

  // 事务后写指纹：失败不吞但也不回滚批量写——返回 fingerprintStored:false，下次必重弹。
  let fingerprintStored = false;
  try {
    booksRepo.updateGenGate(db, bookId, {
      fingerprint,
      suppressed: decisions.suppress === true,
      updatedAt: new Date().toISOString(),
    });
    fingerprintStored = true;
  } catch {
    fingerprintStored = false;
  }
  results.fingerprintStored = fingerprintStored;
  return { results, fingerprint, fingerprintStored };
}
