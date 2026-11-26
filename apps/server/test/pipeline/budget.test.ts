import { describe, expect, it } from 'vitest';
import type { ProviderConfig } from '../../src/config';
import { estimateOutputBudget } from '../../src/pipeline/budget';

// DEC-2026-1126-06：长章自适应输出预算（比率 4.0 token/字、余量 2048、prompt 预留 4096、上限 512000、floor 1024）。
// 事故回归基准：iq3_xxs 三发全部顶格 8192 → 6000 字目标在 token 层结构性不可达。

const pLocal: ProviderConfig = {
  name: 'local',
  baseURL: 'http://127.0.0.1:47831/v1',
  apiKey: 'strata',
  model: 'iq3_s',
  contextWindow: 524288,
  maxOutput: 8192,
  supportsJsonSchema: false,
};

const pSmallWindow: ProviderConfig = { ...pLocal, contextWindow: 15000 };

// BUDGETS_DRAFT 槽预算和（config.ts 现值），测试内钉死防漂移
const SUM_BUDGETS_DRAFT = 500 + 20000 + 8000 + 1000 + 1600 + 600 + 1000 + 2500 + 1500 + 2500 + 800;

describe('estimateOutputBudget（DEC-2026-1126-06）', () => {
  it('事故场景：6000 字目标 → 预算 ≈26k，必须大于旧顶格 8192', () => {
    expect(estimateOutputBudget(6000, SUM_BUDGETS_DRAFT, pLocal)).toBe(26048); // min(512000, 24000+2048, 524288-40000-4096)
    expect(estimateOutputBudget(6000, SUM_BUDGETS_DRAFT, pLocal)).toBeGreaterThan(8192); // 回归钉：证明修复
  });

  it('短章小目标 → 预算收缩到 3248（省本地服务资源，允许小于旧默认）', () => {
    expect(estimateOutputBudget(300, SUM_BUDGETS_DRAFT, pLocal)).toBe(3248); // 300×4+2048
  });

  it('窗口被 prompt 吃满 → clamp 到 floor=1024', () => {
    expect(estimateOutputBudget(6000, 10000, pSmallWindow)).toBe(1024); // min(512000, 26048, -996) → floor
  });

  it('owner 拍板上限生效：超大目标 clamp 到 512000', () => {
    expect(estimateOutputBudget(200000, 0, pLocal)).toBe(512000); // min(512000, 802048, 520192)
  });

  it('不做运行期 /models 探测的实现决策留痕：iq3_s 实际 n_ctx=393216 < config 硬编码 524288，现实用量（prompt≈40k+预算≤50k）永不触顶', () => {
    const realistic = estimateOutputBudget(6000, SUM_BUDGETS_DRAFT, { ...pLocal, contextWindow: 393216 });
    expect(realistic).toBe(26048); // 真实窗口下结果不变——静态 clamp 足够
  });
});
