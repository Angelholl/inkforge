import { z } from 'zod';
import { DIM_SOURCE_COEXIST, STYLE_DIMENSIONS } from '@inkforge/shared';

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
  // 书级落地策略（DEC-2026-1122-01）：无上限 max——超大 int≥2 合法入库（语义=章号难达倍数→合成恒 L，可接受配置）；0/1/负数/非整数→400
  landingMandate: z
    .object({
      mode: z.enum(['off', 'cadence']),
      heavyEveryN: z.number().int().min(2).optional(),
    })
    .nullable()
    .optional(),
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
    mustHaveBeats: z.array(z.object({ text: z.string(), keywords: z.array(z.string().min(1)), grade: z.enum(['H', 'L']).optional() })),
    bannedTopics: z.array(z.string()),
  }),
  targetChars: z.number().int().positive().optional(),
});

export const generateSchema = z.object({
  maxRounds: z.number().int().min(1).max(5).optional(),
});

export const createRunSchema = z
  .object({
    bookId: z.string().min(1),
    fromChapter: z.number().int().positive(),
    toChapter: z.number().int().positive(),
    mode: z.enum(['generate', 'continue']).default('generate'),
    maxRounds: z.number().int().min(1).max(5).optional(),
  })
  .refine((v) => v.fromChapter <= v.toChapter, { message: 'fromChapter 不得大于 toChapter（audit 2026-11-23 F-4：倒挂 scope=空 run）' });

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
    // 规则 5：dimsSource 键 ∈ 七维；值 ∈ 主∪辅 ∪ {共存哨兵}（DEC-2026-1118-03）
    const allowed = new Set([v.primaryProfileId, ...aux]);
    for (const [dim, src] of Object.entries(v.dimsSource ?? {})) {
      if (!(STYLE_DIMENSIONS as readonly string[]).includes(dim)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dimsSource', dim], message: `未知风格维度：${dim}` });
      } else if (src !== DIM_SOURCE_COEXIST && !allowed.has(src)) {
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

// selection 可选（DEC-2026-1120-01）：缺省=全文模式，指令作用于该版本整章正文（服务端另有 8000 字硬门）
export const rewriteSelectionSchema = z.object({
  selection: z.string().min(1).optional(),
  instruction: z.string().min(1),
});

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
    freqTerms: z.array(z.object({ term: z.string().min(1), note: z.string() })).optional(),
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

// 落地分级词表（DEC-2026-1122-02）：用户数据层，PUT 写用户文件，下一次生成 run 生效
export const landingWordsPutSchema = z.object({ text: z.string() });

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

// 剧情蒸馏（DEC-2026-1120-03）：PLOT 行协议草稿，沿仿写 schema 同构
export const plotAnalyzeSchema = z.object({
  name: z.string().min(1),
  text: z.string().min(1),
});

export const plotSaveSchema = z.object({
  draft: z.object({
    name: z.string().min(1),
    sourcePath: z.string().min(1),
    sourceHash: z.string().min(8),
    structure: z.array(z.string().min(1)).min(1).max(10),
  }),
});

export const plotBindSchema = z.object({
  profileId: z.string().min(1).nullable(),
});

// 人物光谱蒸馏（DEC-2026-1120-09）：ROLE 行协议草稿（匿名化人物原型 3-8 条），沿 plot schema 同构
export const spectrumAnalyzeSchema = z.object({
  name: z.string().min(1),
  text: z.string().min(1),
});

export const spectrumSaveSchema = z.object({
  draft: z.object({
    name: z.string().min(1),
    sourcePath: z.string().min(1),
    sourceHash: z.string().min(8),
    structure: z.array(z.string().min(1)).min(1).max(8),
  }),
});

export const spectrumBindSchema = z.object({
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

// ── 设定集导入（DEC-2026-1120-04）：preview 出草稿（纯解析）；apply 事务建书+归档+文风步 ──
export const settingsImportPreviewSchema = z.object({
  content: z.string().min(1),
});

// draft 整形沿解析 DTO：outlineItems/chapterTitles/warnings 前端回传即被剥（审阅步前端自用）；
// 章骨架单一真值源=outlineTree 卡（DEC-2026-1120-10：apply 服务端从卡落 chapters+blueprint，本 schema 不消费 outlineItems）
export const settingsImportApplySchema = z.object({
  content: z.string().min(1),
  draft: z.object({
    title: z.string().min(1),
    description: z.string().default(''),
    outline: z.string().default(''),
    characters: z
      .array(z.object({ name: z.string().min(1), baseSetting: z.string().default('{}') }))
      .max(100)
      .default([]),
    outlineTree: z
      .object({
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
      })
      .default({ volumes: [] }),
    foreshadowings: z
      .array(z.object({ description: z.string().min(1), plantedCh: z.number().int().positive() }))
      .max(50)
      .default([]),
    styleSection: z.string().default(''),
    importStyle: z.boolean().default(true),
  }),
  // 导入勾选（DEC-2026-1122-01）：body 级，enabled=true 时 apply 事务内写 cadence mandate（Task-04 消费）
  landingMandate: z
    .object({
      enabled: z.boolean().default(false),
      heavyEveryN: z.number().int().min(2).default(2),
    })
    .default({ enabled: false, heavyEveryN: 2 }),
});

/** 融合门张力对照（Task-03）：不收请求字段，全部服务端取数；optional 兼容空 body。 */
export const fusionGateAnalyzeSchema = z.object({}).optional();

/**
 * 融合门确认（Task-04）：逐项裁决，全部字段 optional（undefined=该项不动）。
 * styleBinding 四键必填；weights/辅档不重复/dimsSource 规则沿抄 styleBindSchema :64-119 既有口径，不另造。
 */
export const fusionGateConfirmSchema = z
  .object({
    description: z.string().optional(),
    styleBinding: z
      .object({
        primaryProfileId: z.string().min(1),
        auxProfileIds: z.array(z.string().min(1)).max(3, '风格档案最多绑定 4 个（1 主 + 3 辅）'),
        dimsSource: z.record(z.string(), z.string().min(1)),
        weights: z.record(z.string(), z.number().int().min(1)),
      })
      .superRefine((v, ctx) => {
        // 沿抄 styleBindSchema 规则 4/4.5：主辅不重复、辅档内部不重复
        if (v.auxProfileIds.includes(v.primaryProfileId)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['auxProfileIds'], message: '主风格不可重复勾选' });
        }
        if (new Set(v.auxProfileIds).size !== v.auxProfileIds.length) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['auxProfileIds'], message: '辅档案不可重复勾选' });
        }
        // 沿抄规则 5：dimsSource 键 ∈ 七维，值 ∈ 主∪辅 ∪ {共存哨兵}
        const allowed = new Set([v.primaryProfileId, ...v.auxProfileIds]);
        for (const [dim, src] of Object.entries(v.dimsSource)) {
          if (!(STYLE_DIMENSIONS as readonly string[]).includes(dim)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dimsSource', dim], message: `未知风格维度：${dim}` });
          } else if (src !== DIM_SOURCE_COEXIST && !allowed.has(src)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dimsSource', dim], message: `维度来源必须在已勾选档案中：${dim}` });
          }
        }
        // 沿抄规则 8：weights 键集恰等绑定全集且 Σ=100（服务端只校验不重归一）
        const expected = new Set([v.primaryProfileId, ...v.auxProfileIds]);
        const got = Object.keys(v.weights);
        if (got.length !== expected.size || !got.every((id) => expected.has(id))) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weights'], message: '比例键集必须恰为基准档案与辅档案全集' });
        } else if (Object.values(v.weights).reduce((s, n) => s + n, 0) !== 100) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weights'], message: '比例之和必须为 100' });
        }
      })
      .optional(),
    imitationProfileId: z.string().nullable().optional(),
    plotProfileId: z.string().nullable().optional(),
    spectrumProfileId: z.string().nullable().optional(),
    suppress: z.boolean().optional(),
  })
  .optional();
