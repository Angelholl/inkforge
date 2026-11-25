import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createMockProvider } from '../../src/llm/mock';
import { migrate } from '../../src/db/migrate';
import { openDb } from '../../src/db/open';
import { characterInstantiateSchema } from '../../src/http/schemas';
import { parseInstantiateOutput } from '../../src/http/character-instantiate';

// FB-F2-1（DEC-2026-1125-03）：光谱→AI 实例化人物卡——schema/DTO 层；解析与端点断言随 FB-F2-2 追加
describe('characterInstantiateSchema（FB-F2-1，DEC-2026-1125-03）', () => {
  it('maxCards 边界：9→拒、8→过、缺省默认 8', () => {
    expect(characterInstantiateSchema.safeParse({ maxCards: 9 }).success).toBe(false);
    expect(characterInstantiateSchema.safeParse({ maxCards: 8 }).success).toBe(true);
    expect(characterInstantiateSchema.parse({}).maxCards).toBe(8);
  });
});

describe('parseInstantiateOutput（FB-F2-2，DEC-2026-1125-03）', () => {
  it('R-F2-1：NAME/BASE 块解析为 {name, baseSetting} 且 baseSetting 为 JSON 对象字符串；整段 JSON 输出→0 卡', () => {
    const raw = 'NAME: 阿磊\nBASE: {"年龄":"17","腔调":"短句冲"}\n\nNAME: 静如\nBASE: {"年龄":"16","腔调":"软而倔"}';
    const draft = parseInstantiateOutput(raw, new Set(), 8);
    expect(draft.cards).toHaveLength(2);
    expect(draft.cards[0].name).toBe('阿磊');
    expect(typeof JSON.parse(draft.cards[0].baseSetting)).toBe('object');
    expect(Array.isArray(JSON.parse(draft.cards[0].baseSetting))).toBe(false);
    // 行协议禁 JSON（DEC-2026-1111-01）：模型整段吐 JSON → 无 NAME:/BASE: 行 → 0 卡
    expect(parseInstantiateOutput('{"name":"阿磊","age":17}', new Set(), 8).cards).toHaveLength(0);
  });

  it('R-F2-2：非法 BASE 丢弃+第N张卡 warning；批内/既有重名各 1→2 条重名 warning；12 张截 8；行数少不截', () => {
    const blocks = [
      'NAME: 阿磊\nBASE: {"身份":"主角"}',
      'NAME: 小虎\nBASE: 这不是JSON', // 第2张卡非法 → 丢弃+warning
      'NAME: 阿磊\nBASE: {"身份":"分身"}', // 批内重名（撞第1张合法卡）→ warning
      'NAME: 既有甲\nBASE: {"身份":"邻居"}', // 与既有卡撞名 → warning
    ];
    const draft = parseInstantiateOutput(blocks.join('\n\n'), new Set(['既有甲']), 8);
    expect(draft.cards).toEqual([{ name: '阿磊', baseSetting: '{"身份":"主角"}' }]);
    expect(draft.warnings).toContain('第2张卡 baseSetting 非 JSON 对象字符串，已跳过');
    expect(draft.warnings).toContain('人物卡「阿磊」重名，已跳过'); // block3 撞 block1（批内）
    expect(draft.warnings).toContain('人物卡「既有甲」重名，已跳过'); // 撞既有卡
    // 12 张合法 → 截前 8 + 钉死文案（默认 maxCards=8）
    const many = Array.from({ length: 12 }, (_, i) => `NAME: 角色${i}\nBASE: {"序":"${i}"}`).join('\n\n');
    const capped = parseInstantiateOutput(many, new Set(), 8);
    expect(capped.cards).toHaveLength(8);
    expect(capped.warnings).toContain('单次最多 8 张，已截取前 8 张');
    // spectrum 行数 < 卡数（同原型多卡）→ 全留不截
    const few = Array.from({ length: 5 }, (_, i) => `NAME: 线甲角色${i}\nBASE: {"序":"${i}"}`).join('\n\n');
    expect(parseInstantiateOutput(few, new Set(), 8).cards).toHaveLength(5);
  });

  it('R-F2-3：characters 槽 8000 超限按 head 截断（行为面从 assembler 等价断言，跨道共享文件减冲突）', async () => {
    const { assembleContext } = await import('../../src/context/assembler');
    const huge = '长'.repeat(8100) + '尾部牺牲标'; // 8105 字 >8000，head 截断后尾标必不在
    const assembled = assembleContext([{ name: 'characters', content: huge, budgetChars: 8000, stable: false, keep: 'head' }], 100000);
    expect(assembled.user.length).toBe(8000);
    expect(assembled.user).not.toContain('尾部牺牲标');
  });
});

describe('实例化端点（FB-F2-2，DEC-2026-1125-03）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dir: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-instantiate-'));
    const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: path.join(dir, 'srv') });
    const db = openDb(path.join(config.dataDir, 'inkforge.db'));
    migrate(db);
    app = await buildApp({ config, provider: createMockProvider({}), plannerProvider: createMockProvider({}), db, inlineQueue: true });
  });

  afterAll(async () => {
    await app.close();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows 锁瞬态 */
    }
  });

  it('未绑定光谱档案 → 400「未绑定人物光谱档案」', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '实例化无绑书' } });
    const bookId = (created.json() as { id: string }).id;
    const res = await app.inject({ method: 'POST', url: `/api/books/${bookId}/characters/instantiate`, payload: {} });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('未绑定人物光谱档案');
  });
});

