import { z } from 'zod';

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

export const styleBindSchema = z.object({
  profileId: z.string().min(1).nullable(), // null=解绑并清快照
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
