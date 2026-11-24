import { createHash, randomUUID } from 'node:crypto';
import type { StyleAnalysisDto } from '@inkforge/shared';
import type { Database } from '../db/open';
import type { LlmProvider } from '../llm/types';
import { parseAnalysis, parseSelfEval } from '../llm/plainproto';
import { computeStyleMetrics } from './metrics';
import type { StyleSample } from './distill';

export interface SelfEvalItem {
  score: number;
  reason: string;
}

/** 蒸馏分析指令（可被 app_meta distill_template 覆盖，B4；此处为默认模板）。TERMS/FREQTERMS 严禁人物姓名，另出 NAMES 报备行供解析端确定性过滤（DEC-2026-1123-01）。 */
const ANALYSIS_INSTRUCTION = `你是文风分析师。阅读以下文本样本，输出结构化文风档案，行协议如下（每行一个标记）：
DIM: <维度>: <一段描述>（六维：语言与描写、特色词汇、结构与节奏、情感基调、尺度、叙述方式，每维一行）
（语言与描写维=对话腔与描写腔的合并画像：写明对话占比与腔调、描写密度与手法；对话或描写稀缺时写「以叙述推进，对话/描写少」。）
（尺度维=直白度与性描写尺度的画像：写明该样本的直白程度与用词尺度，须引用样本原文露骨用词作证据，每条证据不超过 10 字；样本无相关内容则写「低尺度，淡笔带过」。）
（叙述方式维=视角与距离的画像：写明叙述视角（第一/第三人称等）、人称与 POV 落点、心理距离（贴身内窥/旁观疏离）与心理描写手法。）
AXIS: <轴名>: <0-100 整数>（六轴：叙述温度、语言密度、叙述者姿态、节奏、幽默、情绪表达，每轴一行）
RULES: <一条可执行、可判分的量化规则>（3-8 条，作为六轴的文本补充）
TERMS: <术语>: <用法说明>（抽取地名/专有词/称谓/器物/组织等世界观术语与用法偏好 3-10 条，严禁人物姓名；无则省略本行）
FREQTERMS: <词组>: <总结说明>（结合上方统计总结 3-8 条高频用语：何处高频/什么语境/表达功能；与 TERMS 的世界观术语区分，同样严禁人物姓名；无则省略本行）
NAMES: <原文人物姓名列表，顿号分隔，仅报备不入档案；无则省略本行>
不要输出 JSON、markdown 代码块或任何解释。
【样本开始】`;

/** 旧版纯 RULES 指令（imitation 拆解的 style 段沿用；B1 七维六轴落地后 imitation 的 style_json 形态保持 rulesText）。 */
export const RULES_INSTRUCTION = `你是文风分析师。阅读以下文本样本，输出该文本的量化文风规则，格式为多行 RULES 行：
RULES: <一条规则>
每条规则须可执行、可判分，例如：平均句长区间、对话占比区间、段落长度、叙事人称、标点习惯、禁用句式。输出 5-10 条，不要其他内容。
【样本开始】`;

const SELF_EVAL_INSTRUCTION = `你是文风评审。以下「文风档案」由另一分析师从参考样本总结而来。请阅读 2 段未参与总结的 held-out 样本，检验档案与样本的贴合度，输出两行：
SCORE: <1-5 整数，5=完全贴合>
REASON: <一句理由>
不要输出 JSON、markdown 代码块或任何解释。
【文风档案开始】`;

/** 结构化分析：单次 LLM 调用 → parseAnalysis（缺行容错）；输出完全为空（七维全空且无规则）→ 一次修复重试 → 仍空抛错。
 *  heldOut 非空时追加第二次调用（自评）：SCORE(1-5 钳制)/REASON 解析，缺行 evaluation=[]。 */
export async function analyzeStyle(
  deps: { provider: LlmProvider },
  input: { sourceText: string; samples: string[]; heldOut?: string[]; instruction?: string; temperature?: number; freqBlock?: string },
): Promise<{ analysis: StyleAnalysisDto; evaluation: SelfEvalItem[] }> {
  const instruction = input.instruction?.trim() ? input.instruction : ANALYSIS_INSTRUCTION;
  const baseReq = (user: string) => ({
    system: '你是文风分析师。',
    user,
    temperature: input.temperature ?? 0.3,
    topP: 0.9,
    maxOutputTokens: 4096,
    timeoutMs: 900000,
    meta: { step: 'summarize' as const },
  });
  const user = `${instruction}\n${input.samples.join('\n----\n')}\n【样本结束】${input.freqBlock ? `\n${input.freqBlock}` : ''}`;

  const isEmpty = (a: StyleAnalysisDto): boolean =>
    Object.values(a.dims).every((v) => v === '') && a.rules.length === 0;
  const first = parseAnalysis((await deps.provider.complete(baseReq(user))).text);
  let analysis: StyleAnalysisDto = { dims: first.dims as StyleAnalysisDto['dims'], axes: first.axes as StyleAnalysisDto['axes'], rules: first.rules, terms: first.terms, freqTerms: first.freqTerms };
  if (isEmpty(analysis)) {
    const second = parseAnalysis(
      (await deps.provider.complete(baseReq(`${user}\n\n【解析失败重试】上一轮输出缺少 DIM/AXIS/RULES 标记，请严格按【输出格式】重新输出。`))).text,
    );
    analysis = { dims: second.dims as StyleAnalysisDto['dims'], axes: second.axes as StyleAnalysisDto['axes'], rules: second.rules, terms: second.terms, freqTerms: second.freqTerms };
    if (isEmpty(analysis)) throw new Error('文风分析失败：输出缺少 DIM/AXIS/RULES 行');
  }

  // 自评（held-out 2 段；缺行/未传 → evaluation=[]）
  let evaluation: SelfEvalItem[] = [];
  if (input.heldOut && input.heldOut.length > 0) {
    const evalUser = [
      SELF_EVAL_INSTRUCTION,
      `RULES: ${analysis.rules.join('\nRULES: ') || '（无规则行）'}`,
      `七维要点: ${Object.entries(analysis.dims).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${v}`).join('；') || '（无）'}`,
      `【文风档案结束】`,
      `【held-out 样本开始】`,
      input.heldOut.join('\n----\n'),
      `【held-out 样本结束】`,
    ].join('\n');
    const evalRes = parseSelfEval((await deps.provider.complete(baseReq(evalUser))).text);
    evaluation = evalRes.evaluation;
  }
  return { analysis, evaluation };
}

/** 结构化档案落库：rules_json = { rulesText, dims, axes }（rulesText 键保留供 chapter.ts 注入端）；
 *  evaluation 非空时 metrics_json 附 selfScore/selfReason（档案列表展示）；同 source_hash version+1 不可变。 */
export function saveStyleProfile(
  db: Database,
  input: { name: string; source: string; sourcePath?: string; analysis: StyleAnalysisDto; samples: StyleSample[]; evaluation?: SelfEvalItem[] },
): { id: string; version: number } {
  if (input.source.replace(/\s/g, '') === '') {
    throw new Error('样本为空，禁止蒸馏');
  }
  const sourceHash = createHash('sha256').update(input.source).digest('hex');
  const sourcePath = input.sourcePath ?? `inline:${sourceHash.slice(0, 8)}`;
  const prev = db
    .prepare('SELECT MAX(version) AS v FROM style_profiles WHERE source_hash = ?')
    .get(sourceHash) as { v: number | null };
  const version = (prev.v ?? 0) + 1;
  const id = randomUUID();
  const metrics: Record<string, number | string> = { ...computeStyleMetrics(input.source) };
  if (input.evaluation && input.evaluation.length > 0) {
    metrics.selfScore = input.evaluation[0].score;
    metrics.selfReason = input.evaluation[0].reason;
  }
  db.prepare(
    'INSERT INTO style_profiles(id, name, source_path, source_hash, version, rules_json, samples_json, metrics_json, created_at) VALUES(?,?,?,?,?,?,?,?,?)',
  ).run(
    id,
    input.name,
    sourcePath,
    sourceHash,
    version,
    JSON.stringify({
      rulesText: input.analysis.rules.join('\n'),
      dims: input.analysis.dims,
      axes: input.analysis.axes,
      terms: input.analysis.terms ?? [],
      freqTerms: input.analysis.freqTerms ?? [],
    }),
    JSON.stringify(input.samples),
    JSON.stringify(metrics),
    new Date().toISOString(),
  );
  // 0008：整篇原文按 hash 唯一留存一份，供「重新蒸馏」复用（同 hash 二次入库不覆盖）
  db.prepare('INSERT INTO style_sources(id, source_hash, name, text, created_at) VALUES(?,?,?,?,?) ON CONFLICT(source_hash) DO NOTHING').run(
    randomUUID(),
    sourceHash,
    input.name,
    input.source,
    new Date().toISOString(),
  );
  return { id, version };
}
