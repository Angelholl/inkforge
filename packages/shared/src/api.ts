import type { ChapterBlueprint, ChapterKind, ChapterStatus, RunStatus, StepName, StepStatus } from './domain';

export interface CharacterInput {
  name: string;
  baseSetting?: string;
}

export interface BookDto {
  id: string;
  title: string;
  description: string;
  outline: string;
  styleProfileId?: string;
  styleSnapshotJson?: string | null;
  imitationProfileId?: string | null;
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
  /** run 种类：pipeline=生成管线；polish=批量校对 */
  kind?: 'pipeline' | 'polish';
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
  outline?: string;
  characters?: CharacterInput[];
}

export interface CharacterDto {
  id: string;
  name: string;
  baseSetting: string;
}

export interface CreateCharacterBody {
  name: string;
  baseSetting?: string;
}

export interface UpdateCharacterBody {
  name?: string;
  baseSetting?: string;
}

export interface BookMetaPutBody {
  title?: string;
  description?: string;
  outline?: string;
}

export interface BlueprintPutBody {
  title: string;
  blueprint: ChapterBlueprint;
  targetChars?: number;
}

export interface BlueprintSuggestBody {
  chapterNo: number;
}

export interface OutlineSuggestBody {
  chapterCount: number;
}

export interface OutlineItemDto {
  chapterNo: number;
  blueprint: ChapterBlueprint;
}

export interface OutlineSuggestResult {
  outline: OutlineItemDto[];
  source: 'llm';
}

// ── 三级大纲树（卷→阶段→滚动执行卡）──
export interface OutlineCardDto {
  title: string;
  body: string;
  seq: number;
  chapterFrom: number | null;
  chapterTo: number | null;
}

export interface OutlineStageDto {
  title: string;
  body: string;
  seq: number;
  cards: OutlineCardDto[];
}

export interface OutlineVolumeDto {
  title: string;
  body: string;
  seq: number;
  stages: OutlineStageDto[];
}

export interface OutlineTreeDto {
  volumes: OutlineVolumeDto[];
}

export interface OutlineTreeSuggestBody {
  chapterCount: number;
}

export interface OutlineTreeSuggestResult {
  tree: OutlineTreeDto;
  source: 'llm';
}

export interface OutlineTreeGetResult {
  tree: OutlineTreeDto | null;
}

export interface OutlineCheckBody {
  upToChapter?: number;
}

export interface OutlineCheckResult {
  report: string;
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
  temperature?: number;
  maxSegments?: number;
}

export interface SelfEvalItemDto {
  score: number;
  reason: string;
}

// ── 伏笔 CRUD（三小件 C2）──
export interface ForeshadowingDto {
  id: string;
  bookId: string;
  description: string;
  plantedCh: number;
  advancedJson: string;
  resolvedCh?: number;
  status: 'open' | 'advanced' | 'resolved';
}

export interface ForeshadowingCreateBody {
  description: string;
  plantedCh: number;
}

export interface ForeshadowingUpdateBody {
  description?: string;
  plantedCh?: number;
  status?: 'open' | 'advanced' | 'resolved';
  resolvedCh?: number;
}

export type ExportFormat = 'chapters-md' | 'combined-md' | 'txt';

/** 蒸馏分析 draft（不入库；确认门后经 StyleProfileCreateBody 入库）。 */
export interface DistillStyleDraftDto {
  analysis: StyleAnalysisDto;
  samples: string[];
  evaluation: SelfEvalItemDto[];
}

export interface StyleProfileCreateBody {
  name: string;
  text: string;
  analysis: StyleAnalysisDto;
  samples: string[];
  evaluation?: SelfEvalItemDto[];
}

// ── 蒸馏结构化档案（七维文本 + 六轴量化，MirrorNovel 对标；RULES 行保留为文本补充）──
export const STYLE_DIMENSIONS = ['节奏', '对话', '描写', '情感基调', '写作特点', '特色词汇', '章节结构'] as const;
export const STYLE_AXES = ['叙述温度', '语言密度', '叙述者姿态', '节奏', '幽默', '情绪表达'] as const;

export type StyleDimension = (typeof STYLE_DIMENSIONS)[number];
export type StyleAxis = (typeof STYLE_AXES)[number];

export interface StyleTermDto {
  term: string;
  note: string;
}

export interface StyleAnalysisDto {
  dims: Record<StyleDimension, string>;
  axes: Record<StyleAxis, number>;
  rules: string[];
  /** 术语表（人名/地名/专有词与用法偏好；TERMS 行缺省为 []） */
  terms?: StyleTermDto[];
}

// ── 拆解仿写（Pagekin 式）──
export interface ImitationAnalyzeBody {
  name: string;
  text: string;
  chapterCount: number;
}

/** 分析 draft（不入库）；style 为 B1 七维六轴的接口对齐点（当前 rulesText 形态）。 */
export interface ImitationDraftDto {
  name: string;
  sourcePath: string;
  sourceHash: string;
  structure: string[];
  style: { rulesText: string };
  blueprint: OutlineItemDto[];
  metrics: Record<string, number | string>;
}

export interface ImitationSaveBody {
  draft: ImitationDraftDto;
}

export interface ImitationProfileDto {
  id: string;
  name: string;
  version: number;
  sourcePath: string;
  createdAt: string;
}

export interface ImitationBindBody {
  profileId: string | null;
}
