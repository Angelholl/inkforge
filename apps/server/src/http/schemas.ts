import { z } from 'zod';
import { STYLE_DIMENSIONS } from '@inkforge/shared';

export const createBookSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  outline: z.string().optional(),
  characters: z.array(z.object({ name: z.string().min(1), baseSetting: z.string().optional() })).optional(),
});

export const bookMetaPutSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  outline: z.string().optional(),
});

export const createCharacterSchema = z.object({
  name: z.string().min(1),
  baseSetting: z.string().optional(),
});

export const updateCharacterSchema = z.object({
  name: z.string().min(1).optional(),
  baseSetting: z.string().optional(),
});

export const blueprintSchema = z.object({
  title: z.string().min(1),
  blueprint: z.object({
    goal: z.string().min(1),
    beats: z.array(z.string()),
    mustHaveBeats: z.array(z.object({ text: z.string(), keywords: z.array(z.string().min(1)) })),
    bannedTopics: z.array(z.string()),
  }),
  targetChars: z.number().int().positive().optional(),
});

export const generateSchema = z.object({
  maxRounds: z.number().int().min(1).max(5).optional(),
});

export const createRunSchema = z.object({
  bookId: z.string().min(1),
  fromChapter: z.number().int().positive(),
  toChapter: z.number().int().positive(),
  mode: z.enum(['generate', 'continue']).default('generate'),
  maxRounds: z.number().int().min(1).max(5).optional(),
});

export const importOriginalSchema = z.object({
  chapters: z.array(z.object({ title: z.string().min(1), content: z.string().min(1) })).min(1).max(500),
});

export const styleBindSchema = z
  .object({
    profileId: z.string().min(1).nullable().optional(), // null=解绑并清快照；字符串=legacy 单绑（路由归一单主）
    primaryProfileId: z.string().min(1).optional(),
    auxProfileIds: z.array(z.string().min(1)).max(3, '风格档案最多绑定 4 个（1 主 + 3 辅）').optional(),
    dimsSource: z.record(z.string(), z.string().min(1)).optional(),
    weights: z.record(z.string(), z.number().int().min(1)).optional(),
  })
  .superRefine((v, ctx) => {
    const hasBindingFields =
      v.primaryProfileId !== undefined || v.auxProfileIds !== undefined || v.dimsSource !== undefined || v.weights !== undefined;
    // 规则 1：解绑请求不得携带绑定字段（规则 7：解绑无需主风格，放行）
    if (v.profileId === null) {
      if (hasBindingFields) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['profileId'], message: '解绑请求不得携带绑定字段' });
      }
      return;
    }
    // 规则 2：legacy 单绑与显式主档互斥；规则 3 例外放行（profileId 为字符串且其余字段全缺省 = legacy 合法单绑）
    if (typeof v.profileId === 'string') {
      if (v.primaryProfileId !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['profileId'], message: 'profileId 与 primaryProfileId 不可同时出现' });
      }
      return;
    }
    // 规则 3：绑定请求必须显式指定主风格
    if (v.primaryProfileId === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['primaryProfileId'], message: '必须显式指定主风格' });
      return;
    }
    // 规则 4：主辅重复（总档案数 >4 由 aux max(3) + 本条联合保证，见规则 6 文案挂在 max issue）
    const aux = v.auxProfileIds ?? [];
    if (aux.includes(v.primaryProfileId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['auxProfileIds'], message: '主风格不可重复勾选' });
    }
    // 规则 4.5（DEC-2026-1117-05 D4）：辅档案内部重复——此前漏拦致落库撞 UNIQUE 出 500，现显式 400
    if (new Set(aux).size !== aux.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['auxProfileIds'], message: '辅档案不可重复勾选' });
    }
    // 规则 5：dimsSource 键 ∈ 七维；值 ∈ 主∪辅
    const allowed = new Set([v.primaryProfileId, ...aux]);
    for (const [dim, src] of Object.entries(v.dimsSource ?? {})) {
      if (!(STYLE_DIMENSIONS as readonly string[]).includes(dim)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dimsSource', dim], message: `未知风格维度：${dim}` });
      } else if (!allowed.has(src)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dimsSource', dim], message: `维度来源必须在已勾选档案中：${dim}` });
      }
    }
    // 规则 8（DEC-2026-1117-05）：weights 键集恰等绑定全集且 Σ=100（客户端归一后提交，服务端只校验不重归一）
    if (v.weights !== undefined) {
      const expected = new Set([v.primaryProfileId, ...aux]);
      const got = Object.keys(v.weights);
      if (got.length !== expected.size || !got.every((id) => expected.has(id))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weights'], message: '比例键集必须恰为基准档案与辅档案全集' });
      } else if (Object.values(v.weights).reduce((s, n) => s + n, 0) !== 100) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weights'], message: '比例之和必须为 100' });
      }
    }
  });

export const rewriteSelectionSchema = z.object({
  selection: z.string().min(1),
  instruction: z.string().min(1),
});

export const cancelRunSchema = z.object({}).strict().optional();

export const distillStyleSchema = z.object({
  name: z.string().min(1),
  text: z.string().min(1),
  temperature: z.number().min(0).max(1).optional(),
  maxSegments: z.number().int().min(4).max(20).optional(),
});

export const styleProfileCreateSchema = z.object({
  name: z.string().min(1),
  text: z.string().min(1),
  analysis: z.object({
    dims: z.record(z.string(), z.string()),
    axes: z.record(z.string(), z.number()),
    rules: z.array(z.string()),
    terms: z.array(z.object({ term: z.string().min(1), note: z.string() })).optional(),
  }),
  samples: z.array(z.string().min(1)).min(1),
  evaluation: z.array(z.object({ score: z.number().int().min(1).max(5), reason: z.string() })).optional(),
});

// 空串=恢复默认模板
export const distillTemplatePutSchema = z.object({
  template: z.string(),
});

// B3：入库分阈值（1-10）；持久化在 app_meta，改值不重启
export const qualityPutSchema = z.object({ scoreThreshold: z.number().min(1).max(10) });

export const outlineTreeSuggestSchema = z.object({ chapterCount: z.number().int().min(1).max(50) });

// 整树替换：seq 不收（repo 归一）；chapterFrom/To 可空；缺省字段兜底空串/空数组
export const outlineTreePutSchema = z.object({
  tree: z.object({
    volumes: z
      .array(
        z.object({
          title: z.string().default(''),
          body: z.string().default(''),
          stages: z
            .array(
              z.object({
                title: z.string().default(''),
                body: z.string().default(''),
                cards: z
                  .array(
                    z.object({
                      title: z.string().default(''),
                      body: z.string().default(''),
                      chapterFrom: z.number().int().positive().nullable().optional(),
                      chapterTo: z.number().int().positive().nullable().optional(),
                    }),
                  )
                  .default([]),
              }),
            )
            .default([]),
        }),
      )
      .default([]),
  }),
});

export const outlineCheckSchema = z.object({
  upToChapter: z.number().int().positive().optional(),
});

export const imitationAnalyzeSchema = z.object({
  name: z.string().min(1),
  text: z.string().min(1),
  chapterCount: z.number().int().min(1).max(50),
});

const imitationBlueprintBlockSchema = z.object({
  chapterNo: z.number().int().positive(),
  blueprint: z.object({
    goal: z.string(),
    beats: z.array(z.string()),
    mustHaveBeats: z.array(z.object({ text: z.string(), keywords: z.array(z.string()) })),
    bannedTopics: z.array(z.string()),
  }),
});

// analyze 产出的 draft 原样回存（版本号由 save 服务端按 hash 计算，不收）
export const imitationSaveSchema = z.object({
  draft: z.object({
    name: z.string().min(1),
    sourcePath: z.string().min(1),
    sourceHash: z.string().min(8),
    structure: z.array(z.string().min(1)).min(1).max(8),
    style: z.object({ rulesText: z.string() }),
    blueprint: z.array(imitationBlueprintBlockSchema).min(1),
    metrics: z.record(z.string(), z.union([z.number(), z.string()])),
  }),
});

export const imitationBindSchema = z.object({
  profileId: z.string().min(1).nullable(),
});

export const polishSchema = z.object({
  chapterFrom: z.number().int().positive(),
  chapterTo: z.number().int().positive(),
});

export const foreshadowingCreateSchema = z.object({
  description: z.string().min(1),
  plantedCh: z.number().int().positive(),
});

// resolved 状态必须带 resolvedCh（C2 钉死）
export const foreshadowingUpdateSchema = z
  .object({
    description: z.string().min(1).optional(),
    plantedCh: z.number().int().positive().optional(),
    status: z.enum(['open', 'advanced', 'resolved']).optional(),
    resolvedCh: z.number().int().positive().optional(),
  })
  .refine((d) => d.status !== 'resolved' || d.resolvedCh !== undefined, {
    message: 'resolved 状态必须带 resolvedCh',
  });

/** 逐书文风示例开关（B4 裁决④）。 */
export const styleFewshotPutSchema = z.object({ on: z.boolean() });
