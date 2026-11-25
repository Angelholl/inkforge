import { api } from '../api/client';
import { DistillProfilesShell } from '../components/DistillProfilesShell';

/** 剧情蒸馏分区（DEC-2026-1120-03）：analyze→预览（结构行可编辑）→确认入库→列表→绑定书。draft 不入库，确认才落档案。 */
export default function PlotProfilesSection() {
  return (
    <DistillProfilesShell
      queryKey={['plot-profiles']}
      listApi={api.listPlotProfiles}
      api={{
        analyze: api.analyzePlot,
        save: api.savePlotProfile,
        remove: api.deletePlotProfile,
      }}
      labels={{
        title: '剧情蒸馏（剧情档案）',
        description:
          '从参考正文蒸馏剧情骨架（开篇钩子/卷级推进/多线节奏/高潮布局/收束/可复用桥段）；绑定书后 AI 建议蓝图时注入【剧情参考】。drafter 不注入参考正文（防抄用红线）。',
        testid: 'plot-profiles',
        listTitle: '剧情档案列表',
        emptyTitle: '还没有剧情档案',
        emptyHint: '粘贴 ≥200 字参考正文，从下方表单蒸馏第一个。',
        formTitle: '蒸馏新档案',
        namePlaceholder: '剧情档案名称',
        nameAriaLabel: '剧情档案名称',
        textPlaceholder: '粘贴参考作品正文（去空白后需 ≥200 字；服务端按 8×2000 字抽样蒸馏剧情骨架）',
        textAriaLabel: '剧情蒸馏样本',
        analyzeButton: '剧情蒸馏',
        emptyNameMsg: '请先填写剧情档案名称',
        shortTextMsg: (stripped) => `参考正文去空白后不足 200 字（当前 ${stripped} 字），请粘贴或导入更多正文`,
        draftReadyMsg: '剧情蒸馏完成（草稿未入库），可逐行编辑后点「确认入库」',
        analyzeFailMsg: (message) => `剧情蒸馏失败：${message}`,
        previewTitle: '草稿预览（未入库，每行一条剧情骨架，可编辑）',
        draftTextAriaLabel: '剧情草稿结构行',
        emptyStructureMsg: '结构行不能全为空',
        savedMsg: (name) => `剧情档案已入库：${name}`,
        saveFailMsg: (message) => `入库失败：${message}`,
        discardMsg: '已放弃草稿',
        removedMsg: (label) => `剧情档案「${label}」已删除（相关书绑定已清空）`,
        removeFailMsg: (message) => `删除失败：${message}`,
        deleteWarning: '该剧情档案将删除，已绑定书将自动解绑，不可恢复。',
        structureCount: (count) => `${count} 条剧情骨架`,
      }}
    />
  );
}
