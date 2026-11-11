export const CHAPTER_KINDS = ['original', 'draft', 'revised', 'final', 'manual_edit'] as const;

export const DIMENSIONS = [
  '设定一致',
  '人物一致',
  '情节推进',
  '文风贴合',
  '节奏',
  '结尾钩子',
  '重复度',
] as const;

export type ChapterKind = (typeof CHAPTER_KINDS)[number];

export type RunStatus = 'queued' | 'running' | 'paused' | 'cancelled' | 'done' | 'failed';

export type StepName = 'draft' | 'qc' | 'rewrite' | 'summarize' | 'finalize';

export type StepStatus = 'queued' | 'inflight' | 'done' | 'failed' | 'skipped';

export type ChapterStatus = 'planned' | 'drafting' | 'in_qc' | 'needs_human' | 'done';

export interface BeatRequirement {
  text: string;
  keywords: string[];
}

export interface ChapterBlueprint {
  goal: string;
  beats: string[];
  mustHaveBeats: BeatRequirement[];
  bannedTopics: string[];
}

export interface Finding {
  dimension: string;
  severity: 'blocker' | 'major' | 'minor';
  quote: string;
  comment: string;
}

export type RunEvent =
  | { type: 'run.status'; runId: string; status: RunStatus; ts: string }
  | {
      type: 'step.status';
      runId: string;
      chapterNo: number;
      step: StepName;
      attempt: number;
      status: StepStatus;
      ts: string;
    }
  | { type: 'step.delta'; runId: string; chapterNo: number; step: StepName; text: string; ts: string };
