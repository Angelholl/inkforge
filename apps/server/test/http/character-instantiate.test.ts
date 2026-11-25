import { describe, expect, it } from 'vitest';
import { characterInstantiateSchema } from '../../src/http/schemas';

// FB-F2-1（DEC-2026-1125-03）：光谱→AI 实例化人物卡——schema/DTO 层；解析与端点断言随 FB-F2-2 追加
describe('characterInstantiateSchema（FB-F2-1，DEC-2026-1125-03）', () => {
  it('maxCards 边界：9→拒、8→过、缺省默认 8', () => {
    expect(characterInstantiateSchema.safeParse({ maxCards: 9 }).success).toBe(false);
    expect(characterInstantiateSchema.safeParse({ maxCards: 8 }).success).toBe(true);
    expect(characterInstantiateSchema.parse({}).maxCards).toBe(8);
  });
});
