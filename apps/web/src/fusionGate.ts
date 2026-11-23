import { api } from './api/client';
import type { FusionGateReportDto, FusionTensionDto, FusionGateConfirmBody } from '@inkforge/shared';

/** 门视图状态：宿主只渲染这五个字段，不含任何引擎/裁决逻辑（前端零引擎钉）。 */
export interface GateView {
  report: FusionGateReportDto;
  tension?: FusionTensionDto;
  analyzing: boolean;
  busy: boolean;
  onConfirm(body: FusionGateConfirmBody): void;
  onCancel(): void;
}

/** 门挂载点：由页面注入（setState 三件套），helper 负责数据/直通/顺序钉。 */
export interface GateMount {
  show(view: GateView): void;
  patch(part: Partial<GateView>): void;
  hide(): void;
}

/**
 * 门接入唯一入口：直通→直接 startFn；否则打开门。
 * **startFn 必须是「发 run」的闭包**（内部调 api.generateChapter / generateAll / createRun 原方法，不得预发）。
 * confirm 200 → startFn()；confirm 非 200 / 取消 → 不调 startFn（中止不入队）。
 *
 * 返回的 Promise 在「直通 startFn 完成 / 门 confirm + startFn 完成 / 取消」时 settle；
 * confirm 失败则复位 busy、保持门打开并 reject（调用方决定如何回显），绝不提前发 run。
 */
export function startRunWithGate(bookId: string, startFn: () => Promise<void>, mount: GateMount): Promise<void> {
  return (async () => {
    const report = await api.getFusionGate(bookId);
    if (report.action === 'pass') {
      // 直通零打扰：原闭包在此才调用（此前不得预发）
      await startFn();
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let busy = false;

      const finish = (outcome: 'resolve' | 'reject', err?: unknown) => {
        if (settled) return;
        settled = true;
        mount.hide();
        if (outcome === 'resolve') resolve();
        else reject(err);
      };

      const onConfirm = (body: FusionGateConfirmBody) => {
        if (settled || busy) return;
        busy = true;
        mount.patch({ busy: true });
        void (async () => {
          try {
            // 顺序钉：confirm 请求完成（200）后才调 startFn
            await api.confirmFusionGate(bookId, body);
            await startFn();
            finish('resolve');
          } catch (e) {
            busy = false;
            mount.patch({ busy: false });
            finish('reject', e);
          }
        })();
      };

      const onCancel = () => {
        // 取消零写：不调 confirm，更不调 startFn
        finish('resolve');
      };

      mount.show({ report, analyzing: true, busy: false, onConfirm, onCancel });

      // 分析 pass：拉张力行；失败→可见降级（degraded），不阻断确认
      void api
        .analyzeFusionGate(bookId)
        .then((tension) => {
          if (!settled) mount.patch({ tension, analyzing: false });
        })
        .catch(() => {
          if (!settled) mount.patch({ tension: { rows: [], degraded: true }, analyzing: false });
        });
    });
  })();
}
