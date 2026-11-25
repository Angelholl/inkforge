import { z } from 'zod';
import type { StepName } from '@inkforge/shared';
import { readSettingsFile } from './settings';

export type RoleName = 'planner' | 'drafter' | 'qc' | 'rewriter' | 'summarizer';

export interface ProviderConfig {
  name: 'local' | 'cloud';
  baseURL: string;
  apiKey: string;
  model: string;
  contextWindow: number;
  maxOutput: number;
  supportsJsonSchema: boolean;
}

interface DraftBudgets {
  hardRules: number;
  worldview: number;
  characters: number;
  styleRules: number;
  styleDims: number;
  freqTerms: number; // DEC-2026-1125-03①：高频词常注槽（draft/rewrite 600、8k 档 0）
  blueprint: number;
  continuity: number;
  prevTail: number;
  fewShot: number;
  task: number;
}

interface QcBudgets {
  hardRules: number;
  draft: number;
  blueprint: number;
  continuity: number;
}

interface RewriteBudgets {
  hardRules: number;
  styleRules: number;
  styleDims: number;
  freqTerms: number; // DEC-2026-1125-03①
  fewShot: number;
  original: number;
  findings: number;
  factBaseline: number;
  task: number;
}

interface PlannerBudgets {
  hardRules: number;
  continuity: number;
  prevTail: number;
  task: number;
}

interface OutlineBudgets {
  hardRules: number;
  worldview: number;
  characters: number;
  outline: number;
  task: number;
}

export interface AppConfig {
  port: number;
  dataDir: string;
  mock: boolean;
  providers: { local: ProviderConfig; cloud?: ProviderConfig };
  roles: Record<RoleName, { provider: 'local' | 'cloud'; model: string }>;
  budgets: {
    draft: DraftBudgets;
    draft8k: DraftBudgets;
    qc: QcBudgets;
    qc8k: QcBudgets;
    rewrite: RewriteBudgets;
    planner: PlannerBudgets;
    outline: OutlineBudgets;
  };
  quality: { targetChars: number; scoreThreshold: number; minGain: number; maxRounds: number };
  timeouts: Record<Exclude<StepName, 'finalize'>, number>;
}

const envSchema = z.object({
  STRATA_BASE_URL: z.string().min(1),
  STRATA_API_KEY: z.string().min(1),
  STRATA_MODEL: z.string().min(1),
  INKFORGE_PORT: z.coerce.number().int().positive().default(8787),
  INKFORGE_DATA_DIR: z.string().default('data'),
  INKFORGE_MOCK: z.string().default('0'),
  INKFORGE_CLOUD_BASE_URL: z.string().default(''),
  INKFORGE_CLOUD_API_KEY: z.string().default(''),
  INKFORGE_CLOUD_MODEL: z.string().default(''),
  INKFORGE_ROLE_PLANNER: z.enum(['local', 'cloud']).default('local'),
  INKFORGE_ROLE_DRAFTER: z.enum(['local', 'cloud']).default('local'),
  INKFORGE_ROLE_QC: z.enum(['local', 'cloud']).default('local'),
  INKFORGE_ROLE_REWRITER: z.enum(['local', 'cloud']).default('local'),
  INKFORGE_ROLE_SUMMARIZER: z.enum(['local', 'cloud']).default('local'),
  INKFORGE_TEST_HEARTBEAT_MS: z.string().optional(),
  INKFORGE_SUPERVISOR_BACKOFF_MS: z.string().optional(),
});

// DEC-2026-1120-04① 设定集导入「完全加载」扩槽：local contextWindow=524288、总预算≈515k 字符，
// 现槽合计≈10k，扩容余量巨大且只对长设定内容生效（短设定按实际长度取用），溢出收缩逻辑不会触发。
const BUDGETS_DRAFT: DraftBudgets = {
  hardRules: 500,
  worldview: 20000, // DEC-2026-1121-01：16000→20000（owner 令，长设定集余量不足）
  characters: 8000,
  styleRules: 1000,
  styleDims: 1600,
  freqTerms: 600, // DEC-2026-1125-03①
  blueprint: 1000,
  continuity: 2500,
  prevTail: 1500,
  fewShot: 2500,
  task: 800,
};

const BUDGETS_DRAFT_8K: DraftBudgets = {
  hardRules: 300,
  worldview: 200,
  characters: 0,
  styleRules: 0,
  styleDims: 0,
  freqTerms: 0, // DEC-2026-1125-03①：低配档与 fewShot 同族关闭（预算 0=槽内容被截空）
  blueprint: 500,
  continuity: 1000,
  prevTail: 800,
  fewShot: 1000,
  task: 200,
};

const BUDGETS_QC: QcBudgets = { hardRules: 400, draft: 6000, blueprint: 500, continuity: 500 };
const BUDGETS_QC_8K: QcBudgets = { hardRules: 300, draft: 3000, blueprint: 300, continuity: 200 };
const BUDGETS_REWRITE: RewriteBudgets = {
  hardRules: 500,
  styleRules: 400,
  styleDims: 1600, // DEC-2026-1122-03①：targeted 补画像与样本槽，预算对齐 draft（:106/:110）
  freqTerms: 600, // DEC-2026-1125-03①
  fewShot: 2500,
  original: 6000,
  findings: 800,
  factBaseline: 1000,
  task: 800,
};
const BUDGETS_PLANNER: PlannerBudgets = { hardRules: 300, continuity: 1500, prevTail: 1500, task: 800 }; // 300→800：renderBlueprintTask 协议行占 ~210 后书籍简介仅剩 ~90 字（DEC-2026-1120-10）
// DEC-2026-1120-04① 同步扩槽（blueprint-suggest / outline-tree-suggest 槽）
const BUDGETS_OUTLINE: OutlineBudgets = { hardRules: 300, worldview: 20000, characters: 8000, outline: 8000, task: 600 }; // worldview 20000：DEC-2026-1121-01

export function pickBudgetProfile(contextWindow: number): 'draft' | 'draft8k' {
  return contextWindow <= 8192 ? 'draft8k' : 'draft';
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const merged = { ...env, ...readSettingsFile() };
  const e = envSchema.parse(merged);
  const local: ProviderConfig = {
    name: 'local',
    baseURL: e.STRATA_BASE_URL,
    apiKey: e.STRATA_API_KEY,
    model: e.STRATA_MODEL,
    contextWindow: 524288,
    maxOutput: 8192,
    supportsJsonSchema: false,
  };
  let cloud: ProviderConfig | undefined;
  if (e.INKFORGE_CLOUD_BASE_URL && e.INKFORGE_CLOUD_API_KEY && e.INKFORGE_CLOUD_MODEL) {
    cloud = {
      name: 'cloud',
      baseURL: e.INKFORGE_CLOUD_BASE_URL,
      apiKey: e.INKFORGE_CLOUD_API_KEY,
      model: e.INKFORGE_CLOUD_MODEL,
      contextWindow: 200000,
      maxOutput: 8192,
      supportsJsonSchema: true,
    };
  }
  const roles = {
    planner: { provider: e.INKFORGE_ROLE_PLANNER, model: e.STRATA_MODEL },
    drafter: { provider: e.INKFORGE_ROLE_DRAFTER, model: e.STRATA_MODEL },
    qc: { provider: e.INKFORGE_ROLE_QC, model: e.STRATA_MODEL },
    rewriter: { provider: e.INKFORGE_ROLE_REWRITER, model: e.STRATA_MODEL },
    summarizer: { provider: e.INKFORGE_ROLE_SUMMARIZER, model: e.STRATA_MODEL },
  } as Record<RoleName, { provider: 'local' | 'cloud'; model: string }>;
  return {
    port: e.INKFORGE_PORT,
    dataDir: e.INKFORGE_DATA_DIR,
    mock: e.INKFORGE_MOCK === '1',
    providers: { local, ...(cloud ? { cloud } : {}) },
    roles,
    budgets: {
      draft: BUDGETS_DRAFT,
      draft8k: BUDGETS_DRAFT_8K,
      qc: BUDGETS_QC,
      qc8k: BUDGETS_QC_8K,
      rewrite: BUDGETS_REWRITE,
      planner: BUDGETS_PLANNER,
      outline: BUDGETS_OUTLINE,
    },
    quality: { targetChars: 3000, scoreThreshold: 8.0, minGain: 0.05, maxRounds: 2 },
    timeouts: { draft: 3600000, qc: 900000, rewrite: 3600000, summarize: 1200000 },
  };
}
