import { z } from 'zod';

export const createBookSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  characters: z.array(z.object({ name: z.string().min(1), baseSetting: z.string().optional() })).optional(),
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
  profileId: z.string().min(1),
});

export const rewriteSelectionSchema = z.object({
  selection: z.string().min(1),
  instruction: z.string().min(1),
});

export const cancelRunSchema = z.object({}).strict().optional();
