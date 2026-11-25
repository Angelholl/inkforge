import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { buildApp } from '../src/app';
import { createMockProvider } from '../src/llm/mock';
import { migrate } from '../src/db/migrate';
import { openDb, type Database } from '../src/db/open';
import { analyzeSpectrum } from '../src/spectrum';
import { saveSpectrumProfile, getSpectrumProfile, deleteSpectrumProfile, listSpectrumProfiles } from '../src/db/repositories/spectrum';
import { createBook, setBookSpectrumProfile, getBook } from '../src/db/repositories/books';
import { draftSlots } from '../src/context/assembler';
import { loadConfig as loadBaseConfig } from '../src/config';
import type { CompletionRequest, LlmProvider } from '../src/llm/types';

// DEC-2026-1120-09：人物光谱蒸馏（analyzeSpectrum + 脱敏兜底重蒸 + 光谱档案库 + 书绑定注入 planner；drafter 红线不注入）
const SPECTRUM_TEXT = `ROLE: 男角色A：表面忠厚实则狡诈，行事以家族存续为最高动机。
ROLE: 女角色B：外冷内热，关系功能是主角的镜像对照。
ROLE: 尊长C：以秩序维护者自居，动机为守护传承。
ROLE: 反派D：欲望驱动，行事不择手段。
NAMES: 沈砚之、柳如烟`;

const SAMPLE = '山川草木皆有意。'.repeat(60) + '少年负匣而行。'.repeat(40);

let db: Database;
let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-spectrum-'));
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
});

afterAll(() => {
  try {
    db.close();
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows 锁瞬态 */
  }
});

describe('analyzeSpectrum（人物光谱蒸馏）', () => {
  it('ROLE/NAMES 行解析：4 条光谱行、NAMES 不入 structure、hash/sourcePath 沿 plot 先例', async () => {
    const provider = createMockProvider({ summarize: { text: SPECTRUM_TEXT } });
    const draft = await analyzeSpectrum({ db, provider }, { name: '光谱A', text: SAMPLE });
    expect(draft.structure).toHaveLength(4);
    expect(draft.structure[0]).toBe('男角色A：表面忠厚实则狡诈，行事以家族存续为最高动机。');
    expect(draft.structure.some((l) => l.includes('沈砚之'))).toBe(false); // NAMES 行不入库
    expect(draft.sourceHash).toHaveLength(64);
    expect(draft.sourcePath.startsWith('inline:')).toBe(true);
  });

  it('条数钳制：>16 条截到 16 条；<3 条抛「ROLE 行不足 3 条」', async () => {
    const many = Array.from({ length: 20 }, (_, i) => `ROLE: 男角色${i}：特性${i}。`).join('\n') + '\nNAMES: 张三';
    const provider = createMockProvider({ summarize: { text: many } });
    const draft = await analyzeSpectrum({ db, provider }, { name: '光谱B', text: SAMPLE });
    expect(draft.structure).toHaveLength(16);

    const few = 'ROLE: 男角色A：唯一一条。\nNAMES: 张三';
    const provider2 = createMockProvider({ summarize: { text: few } });
    await expect(analyzeSpectrum({ db, provider: provider2 }, { name: '光谱C', text: SAMPLE })).rejects.toThrow('ROLE 行不足 3 条');
  });

  it('抽样调用点：长文本仅取 16 段且 prompt 写 3-16 条', async () => {
    let captured = '';
    let calls = 0;
    const inner = createMockProvider({ summarize: { text: SPECTRUM_TEXT } });
    const provider: LlmProvider = {
      async complete(req) {
        calls++;
        captured = req.user;
        return inner.complete(req);
      },
    };
    const longText = '甲'.repeat(2000 * 21); // 42000 字 → 21 个非空块，均匀取 16
    const draft = await analyzeSpectrum({ db, provider }, { name: '光谱G', text: longText });
    expect(calls).toBe(1); // SPECTRUM_TEXT 无脱敏泄漏，恰一次调用
    expect(draft.structure).toHaveLength(4);
    expect((captured.match(/----/g) ?? []).length).toBe(15);
    expect(captured).toContain('3-16 条');
  });

  it('脱敏命中 → 自动重蒸成功（第二次干净即放行）', async () => {
    const leaked = 'ROLE: 男角色A：狡诈如沈砚之，家族动机。\nROLE: 女角色B：外冷内热。\nROLE: 尊长C：守护传承。\nNAMES: 沈砚之';
    const clean = SPECTRUM_TEXT;
    let calls = 0;
    const provider: LlmProvider = {
      async complete() {
        calls++;
        const text = calls === 1 ? leaked : clean;
        return { text, usage: { promptTokens: 1, completionTokens: 1 }, finishReason: 'end_turn' } as Awaited<ReturnType<LlmProvider['complete']>>;
      },
    };
    const draft = await analyzeSpectrum({ db, provider }, { name: '光谱D', text: SAMPLE });
    expect(calls).toBe(2); // 首蒸违规 → 重蒸一次
    expect(draft.structure).toHaveLength(4);
    expect(draft.structure.join('\n')).not.toContain('沈砚之');
  });

  it('两次脱敏违规 → throw 且错误信息含违规行与命中的名字', async () => {
    const leaked = 'ROLE: 男角色A：如柳如烟般冷酷。\nROLE: 女角色B：外冷内热。\nROLE: 尊长C：守护传承。\nNAMES: 柳如烟';
    let calls = 0;
    const provider: LlmProvider = {
      async complete() {
        calls++;
        return { text: leaked, usage: { promptTokens: 1, completionTokens: 1 }, finishReason: 'end_turn' } as Awaited<ReturnType<LlmProvider['complete']>>;
      },
    };
    await expect(analyzeSpectrum({ db, provider }, { name: '光谱E', text: SAMPLE })).rejects.toThrow(/柳如烟/);
    expect(calls).toBe(2); // 重蒸一次后仍违规即 fail
  });

  it('去空白不足 200 字 → 抛错禁止蒸馏', async () => {
    const provider = createMockProvider({ summarize: { text: SPECTRUM_TEXT } });
    await expect(analyzeSpectrum({ db, provider }, { name: '光谱F', text: '太短。' })).rejects.toThrow('不足 200 字');
  });
});

describe('光谱档案库（repo）', () => {
  it('save/list/get/delete 全链：delete 解绑 books.spectrum_profile_id', () => {
    const book = createBook(db, { title: '光谱绑测书' });
    const { id } = saveSpectrumProfile(db, { name: '光谱A', sourcePath: 'inline:abcd1234', sourceHash: 'a'.repeat(64), structure: ['男角色A：狡诈', '女角色B：外冷内热'] });
    const listed = listSpectrumProfiles(db);
    expect(listed).toHaveLength(1);
    expect(listed[0].structure).toEqual(['男角色A：狡诈', '女角色B：外冷内热']);
    setBookSpectrumProfile(db, book.id, id);
    expect(getBook(db, book.id)!.spectrumProfileId).toBe(id);
    expect(getSpectrumProfile(db, id)!.name).toBe('光谱A');
    expect(deleteSpectrumProfile(db, id)).toBe(true);
    expect(getSpectrumProfile(db, id)).toBeUndefined();
    expect(getBook(db, book.id)!.spectrumProfileId).toBeNull(); // 解绑防悬挂
    expect(deleteSpectrumProfile(db, id)).toBe(false);
  });
});

describe('人物光谱 HTTP 层', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let bookId: string;
  const plannerCalls: CompletionRequest[] = [];

  beforeAll(async () => {
    const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: path.join(dir, 'srv') });
    const plannerInner = createMockProvider({
      summarize: { text: '# 1\nGOAL: 少年出发寻物\nBEATS:\n- 告别村落\n- 初遇同伴\nHOOK: 信物微光再现' },
    });
    const plannerProvider: LlmProvider = {
      async complete(req) {
        plannerCalls.push(req);
        return plannerInner.complete(req);
      },
    };
    const db2 = openDb(path.join(config.dataDir, 'inkforge.db'));
    app = await buildApp({
      config,
      provider: createMockProvider({ summarize: { text: SPECTRUM_TEXT } }), // analyze 走主 provider
      plannerProvider,
      db: db2,
      inlineQueue: true,
    });
    const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '光谱注入测书' } });
    bookId = (created.json() as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('analyze→save→bind→blueprint-suggest 注入【人物光谱参考】全链', async () => {
    const an = await app.inject({ method: 'POST', url: '/api/spectrum-profiles/analyze', payload: { name: '光谱H', text: SAMPLE } });
    expect(an.statusCode).toBe(200);
    const draft = (an.json() as { draft: { name: string; structure: string[] } }).draft;
    expect(draft.structure).toHaveLength(4);

    const saved = await app.inject({ method: 'POST', url: '/api/spectrum-profiles', payload: { draft } });
    expect(saved.statusCode).toBe(201);
    const pid = (saved.json() as { id: string }).id;

    const bound = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/spectrum`, payload: { profileId: pid } });
    expect(bound.statusCode).toBe(200);
    expect((bound.json() as { spectrumProfileId: string }).spectrumProfileId).toBe(pid);

    const sug = await app.inject({ method: 'POST', url: `/api/books/${bookId}/blueprint-suggest`, payload: { chapterNo: 1 } });
    expect(sug.statusCode).toBe(200);
    const plannerReq = plannerCalls[plannerCalls.length - 1];
    expect(plannerReq.user).toContain('【人物光谱参考】');
    expect(plannerReq.user).toContain('男角色A：表面忠厚实则狡诈，行事以家族存续为最高动机。');
  });

  it('spectrumSaveSchema 边界：16 条 201 / 17 条 400', async () => {
    const post = (n: number) =>
      app.inject({
        method: 'POST',
        url: '/api/spectrum-profiles',
        payload: {
          draft: {
            name: '边界',
            sourcePath: 'inline:abcd1234',
            sourceHash: 'a'.repeat(64),
            structure: Array.from({ length: n }, (_, i) => `男角色${i}：特性${i}。`),
          },
        },
      });

    const at16 = await post(16);
    expect(at16.statusCode).toBe(201);

    const at17 = await post(17);
    expect(at17.statusCode).toBe(400);
  });

  it('planner 注入：spectrumReference 预算 1500 字（超 600 的尾部存活）', async () => {
    const saved = await app.inject({
      method: 'POST',
      url: '/api/spectrum-profiles',
      payload: {
        draft: {
          name: '长光谱',
          sourcePath: 'inline:abcd1234',
          sourceHash: 'a'.repeat(64),
          structure: ['甲'.repeat(700) + '尾标甲'],
        },
      },
    });
    expect(saved.statusCode).toBe(201);
    const pid = (saved.json() as { id: string }).id;

    const bound = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/spectrum`, payload: { profileId: pid } });
    expect(bound.statusCode).toBe(200);

    const sug = await app.inject({ method: 'POST', url: `/api/books/${bookId}/blueprint-suggest`, payload: { chapterNo: 1 } });
    expect(sug.statusCode).toBe(200);
    const req = plannerCalls[plannerCalls.length - 1];
    expect(req.user).toContain('尾标甲');
  });

  it('解绑（profileId=null）后 planner 组装不含【人物光谱参考】', async () => {
    const un = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/spectrum`, payload: { profileId: null } });
    expect(un.statusCode).toBe(200);
    const sug = await app.inject({ method: 'POST', url: `/api/books/${bookId}/blueprint-suggest`, payload: { chapterNo: 1 } });
    expect(sug.statusCode).toBe(200);
    expect(plannerCalls[plannerCalls.length - 1].user).not.toContain('【人物光谱参考】');
  });

  it('未知档案 404 / 删除解绑 404 分支', async () => {
    const bad = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/spectrum`, payload: { profileId: 'nope' } });
    expect(bad.statusCode).toBe(404);
    const delUnknown = await app.inject({ method: 'DELETE', url: '/api/spectrum-profiles/nope' });
    expect(delUnknown.statusCode).toBe(404);
    const listed = await app.inject({ method: 'GET', url: '/api/spectrum-profiles' });
    expect((listed.json() as Array<{ id: string }>)[0].id).toBeTruthy();
  });
});

describe('drafter 红线（恒不注入光谱槽）', () => {
  it('draftSlots 组装面无 spectrumReference / 【人物光谱参考】', () => {
    const config = loadBaseConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: path.join(os.tmpdir(), 'inkforge-spectrum-cfg') });
    const slots = draftSlots(
      {
        hardRules: 'H', worldview: 'W', characters: 'C', styleDims: 'D', styleRules: 'R',
        blueprint: 'B', continuity: 'K', prevTail: 'P', fewShot: 'F',
        task: 'T',
      },
      config.budgets.draft,
    );
    expect(slots.some((s) => s.name === 'spectrumReference')).toBe(false);
    expect(slots.map((s) => s.content).join('\n')).not.toContain('【人物光谱参考】');
    fs.rmSync(path.join(os.tmpdir(), 'inkforge-spectrum-cfg'), { recursive: true, force: true });
  });
});
