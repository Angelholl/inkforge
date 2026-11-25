import { api } from '../api/client';
import { DistillProfilesShell } from '../components/DistillProfilesShell';

/** 人物光谱蒸馏分区（DEC-2026-1120-09）：analyze→预览（原型行可编辑）→确认入库→列表→绑定书。draft 不入库，确认才落档案。沿 plot 同构。 */
export default function SpectrumProfilesSection() {
  return (
    <DistillProfilesShell
      queryKey={['spectrum-profiles']}
      listApi={api.listSpectrumProfiles}
      api={{
        analyze: api.analyzeSpectrum,
        save: api.saveSpectrumProfile,
        remove: api.deleteSpectrumProfile,
        bind: api.bindSpectrum,
        listBooks: api.listBooks,
      }}
      labels={{
        title: '人物光谱蒸馏（人物光谱档案）',
        description:
          '从参考正文蒸馏匿名化人物原型（3-16 条，ROLE 行协议，自动防真名泄漏；DEC-2026-1125-02）；绑定书后 AI 建议蓝图时注入【人物光谱参考】。drafter 不注入参考正文（防抄用红线）。',
        testid: 'spectrum-profiles',
        listTitle: '人物光谱档案列表',
        emptyTitle: '还没有人物光谱档案',
        emptyHint: '粘贴 ≥200 字参考正文，从下方表单蒸馏第一个。',
        formTitle: '蒸馏新档案',
        namePlaceholder: '人物光谱档案名称',
        nameAriaLabel: '人物光谱档案名称',
        textPlaceholder: '粘贴参考作品正文（去空白后需 ≥200 字；服务端按 ROLE 行协议蒸馏匿名化人物原型 3-16 条，抽样 16 段×2000）',
        textAriaLabel: '人物光谱蒸馏样本',
        analyzeButton: '人物光谱蒸馏',
        emptyNameMsg: '请先填写人物光谱档案名称',
        shortTextMsg: (stripped) => `参考正文去空白后不足 200 字（当前 ${stripped} 字），请粘贴或导入更多正文`,
        draftReadyMsg: '人物光谱蒸馏完成（草稿未入库），可逐行编辑后点「确认入库」',
        analyzeFailMsg: (message) => `人物光谱蒸馏失败：${message}`,
        previewTitle: '草稿预览（未入库，每行一条人物原型，可编辑）',
        draftTextAriaLabel: '人物光谱草稿原型行',
        emptyStructureMsg: '原型行不能全为空',
        savedMsg: (name) => `人物光谱档案已入库：${name}`,
        saveFailMsg: (message) => `入库失败：${message}`,
        discardMsg: '已放弃草稿',
        removedMsg: (label) => `人物光谱档案「${label}」已删除（相关书绑定已清空）`,
        removeFailMsg: (message) => `删除失败：${message}`,
        deleteWarning: '该人物光谱档案将删除，已绑定书将自动解绑，不可恢复。',
        chooseBookMsg: '请先选择要绑定的书',
        boundMsg: (bookTitle) => `已绑定到《${bookTitle}》：AI 建议蓝图时将注入该人物光谱参考`,
        bindFailMsg: (message) => `绑定失败：${message}`,
        bindLabelPrefix: '绑定书-',
        structureCount: (count) => `${count} 条人物原型`,
      }}
    />
  );
}
