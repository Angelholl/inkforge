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

export interface DraftBudgets {
  hardRules: number;
  worldview: number;
  styleRules: number;
  blueprint: number;
  continuity: number;
  prevTail: number;
  fewShot: number;
  task: number;
}

export interface QcBudgets {
  hardRules: number;
  draft: number;
  blueprint: number;
  continuity: number;
}

export interface RewriteBudgets {
  hardRules: number;
  original: number;
  findings: number;
  factBaseline: number;
  task: number;
}

export interface AppConfig {
  port: number;
  dataDir: string;
  mock: boolean;
  providers: { local: ProviderConfig; cloud?: ProviderConfig };
  roles: Record<RoleName, { provider: 'local' | 'cloud'; model: string }>;
  budgets: { draft: DraftBudgets; draft8k: DraftBudgets; qc: QcBudgets; qc8k: QcBudgets; rewrite: RewriteBudgets };
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

const BUDGETS_DRAFT: DraftBudgets = {
  hardRules: 500,
  worldview: 1000,
  styleRules: 1000,
  blueprint: 1000,
  continuity: 2500,
  prevTail: 1500,
  fewShot: 1500,
  task: 500,
};

const BUDGETS_DRAFT_8K: DraftBudgets = {
  hardRules: 300,
  worldview: 200,
  styleRules: 0,
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
  original: 6000,
  findings: 800,
  factBaseline: 1000,
  task: 500,
};

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
    budgets: { draft: BUDGETS_DRAFT, draft8k: BUDGETS_DRAFT_8K, qc: BUDGETS_QC, qc8k: BUDGETS_QC_8K, rewrite: BUDGETS_REWRITE },
    quality: { targetChars: 3000, scoreThreshold: 8.0, minGain: 0.05, maxRounds: 2 },
    timeouts: { draft: 3600000, qc: 900000, rewrite: 3600000, summarize: 1200000 },
  };
}
