import { api, apiErrorText } from './api/client';
import type { FusionGateReportDto, FusionTensionDto, FusionGateConfirmBody } from '@inkforge/shared';

/** 409 stale 指引文案单一来源：组件按判等渲染整句、无「保存失败：」前缀。 */
export const STALE_GATE_MESSAGE = '这本书的参考资料刚在别处被改动，本次确认的内容已经过期。请点取消，再重新点生成，门会刷新。';

/** 门视图状态：宿主只渲染以下字段，不含任何引擎/裁决逻辑（前端零引擎钉）。 */
export interface GateView {
  report: FusionGateReportDto;
  tension?: FusionTensionDto;
  analyzing: boolean;
  busy: boolean;
  onConfirm(body: FusionGateConfirmBody): void;
  onCancel(): void;
  /** confirm 失败错误文案（主审直修③：单事务整体回滚=零半写，门保持打开、门内回显、可重试可取消）。 */
  error?: string;
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
 * 返回的 Promise 在「直通 startFn 完成 / 门 confirm 成功 + startFn 完成 / 取消」时 settle；
 * confirm 失败（主审直修③）：busy 复位、error 置入门内回显，门保持打开供就地重试或取消，
 * 外层 Promise 悬置至成功/取消——绝不提前发 run，绝不因失败关门丢裁决。
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
            // 顺序钉：confirm 请求完成（200）后才调 startFn；指纹原样回传供服务端 409 守卫
            body.fingerprint = report.fingerprint;
            await api.confirmFusionGate(bookId, body);
            await startFn();
            finish('resolve');
          } catch (e) {
            // 主审直修③：失败=整体回滚未入队——门保持打开，错误进门内，可重试可取消
            // 409=参考资料在他处变动（stale）→ 整句指引；其余走 client 的 error 还原
            busy = false;
            const msg = e instanceof Error ? e.message : String(e);
            mount.patch({ busy: false, error: /→ 409:/.test(msg) ? STALE_GATE_MESSAGE : apiErrorText(e) });
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
