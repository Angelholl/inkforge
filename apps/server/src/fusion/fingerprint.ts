import { createHash } from 'node:crypto';
import type { StyleBinding } from '../db/repositories/books';

/**
 * 实际注入面（规格 §3.5 触发指纹钉）：哈希对象=指纹的序列化真值。
 * 字段序即序列化序（固定键序 JSON.stringify）——增删字段或改序都会改变指纹，须谨慎。
 * mandate（landingMandateJson）与落地词表【不得】入此接口——R6 正交钉。
 */
export interface InjectionFace {
  description: string;
  /** booksRepo.getBookStyleBinding 直接产物（含 dimsSource/weights） */
  styleBinding: StyleBinding | null;
  styleFewshotOn: boolean;
  styleSnapshotJson: string | null;
  plotProfileId: string | null;
  spectrumProfileId: string | null;
  imitationProfileId: string | null;
}

/** sha256 hex of 固定键序 JSON.stringify(face) */
export function injectionFaceFingerprint(face: InjectionFace): string {
  return createHash('sha256').update(JSON.stringify(face)).digest('hex');
}
