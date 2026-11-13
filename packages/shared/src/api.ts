import type { ChapterBlueprint, ChapterKind, ChapterStatus, RunStatus, StepName, StepStatus } from './domain';

export interface CharacterInput {
  name: string;
  baseSetting?: string;
}

export interface BookDto {
  id: string;
  title: string;
  description: string;
  styleProfileId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterDto {
  id: string;
  bookId: string;
  chapterNo: number;
  title: string;
  isOriginal: boolean;
  blueprint: ChapterBlueprint | null;
  targetChars: number;
  status: ChapterStatus;
  currentVersionId?: string;
  createdAt: string;
}

export interface VersionDto {
  id: string;
  chapterId: string;
  parentVersionId?: string;
  kind: ChapterKind;
  content: string;
  wordCount: number;
  runId?: string;
  promptHash?: string;
  model?: string;
  params: object;
  styleSampleIds: string[];
  createdAt: string;
}

export interface RunDto {
  id: string;
  bookId: string;
  mode: 'generate' | 'continue';
  status: RunStatus;
  chapterScope: { from: number; to: number };
  skipFailures: boolean;
  salvagePartial: boolean;
  maxRounds: number;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  error?: string;
}

export interface RunWithStepsDto extends RunDto {
  steps: RunStepDto[];
}

export interface RunStepDto {
  id: string;
  runId: string;
  chapterId: string;
  step: StepName;
  attempt: number;
  status: StepStatus;
  leaseOwner?: string;
  heartbeatAt?: string;
  startedAt?: string;
  endedAt?: string;
  error?: string;
  outputVersionId?: string;
  outputJson?: object;
}

export interface HealthDto {
  ok: true;
  version: string;
}

export interface ReportStepDto {
  step: StepName;
  attempt: number;
  ms: number;
  usage: { promptTokens: number; completionTokens: number };
}

export interface ReportChapterDto {
  chapterNo: number;
  steps: ReportStepDto[];
}

export interface ReportDto {
  chapters: ReportChapterDto[];
  totals: { ms: number; promptTokens: number; completionTokens: number };
}

export interface CreateBookBody {
  title: string;
  description?: string;
  characters?: CharacterInput[];
}

export interface BlueprintPutBody {
  title: string;
  blueprint: ChapterBlueprint;
  targetChars?: number;
}

export interface BlueprintSuggestBody {
  chapterNo: number;
}

export interface GenerateChapterBody {
  maxRounds?: number;
}

export interface CreateRunBody {
  bookId: string;
  fromChapter: number;
  toChapter: number;
  maxRounds?: number;
  mode?: 'generate' | 'continue';
}

export interface ImportOriginalBody {
  chapters: Array<{ title: string; content: string }>;
}

export interface ImportOriginalResult {
  imported: number;
  firstChapterNo: number;
  lastChapterNo: number;
}

export interface StyleBindBody {
  profileId: string;
}

export interface RewriteSelectionBody {
  selection: string;
  instruction: string;
}

export interface StyleProfileDto {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  metrics: Record<string, number | string>;
  sourcePath: string;
}

export interface DistillStyleBody {
  name: string;
  text: string;
}
