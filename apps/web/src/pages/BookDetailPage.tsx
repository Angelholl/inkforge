import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { api, apiErrorText } from '../api/client';
import OutlineTreeSection from './OutlineTreeSection';
import ForeshadowingsSection from './ForeshadowingsSection';
import RunAsideCard from '../components/RunAsideCard';
import { Badge, Button, Chip } from '../components/ui';
import { CardHeader } from '../components/Section';
import { checkboxBase, inputNarrow, selectBase, textareaBase } from '../components/Field';

/** 书详情七节锚点（DEC-2026-1118-02 D4 锚点分区）：纯文本 <a>（禁节名 aria-label，防与表单 label 撞车）。 */
const SECTIONS = [
  { id: 'sec-worldview', label: '设定' },
  { id: 'sec-outline-tree', label: '大纲' },
  { id: 'sec-foreshadowing', label: '伏笔' },
  { id: 'sec-characters', label: '人物卡' },
  { id: 'sec-style', label: '风格' },
  { id: 'sec-chapters', label: '章节' },
  { id: 'sec-blueprint', label: '蓝图' },
] as const;

/** 锚点条滚动跟随（评议员 R4：禁 IntersectionObserver——jsdom 无此 API；scroll 监听+rAF 节流）。 */
function useActiveSection(enabled: boolean): string {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const doc = document.documentElement;
        if (window.innerHeight + window.scrollY >= doc.scrollHeight - 4) {
          setActive(SECTIONS[SECTIONS.length - 1].id);
          return;
        }
        let current: string = SECTIONS[0].id;
        for (const s of SECTIONS) {
          const el = document.getElementById(s.id);
          if (el && el.getBoundingClientRect().top <= 96) current = s.id;
        }
        setActive(current);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [enabled]);
  return active;
}
import { STYLE_DIMENSIONS } from '@inkforge/shared';
import type { CharacterDto, ChapterBlueprint, ExportFormat, StyleBindBody, StyleProfileDto } from '@inkforge/shared';

/**
 * 融合比例归一（DEC-2026-1117-05，客户端归一后提交、服务端只校验）：
 * ① 钳位：整数、≥1（0/空串/NaN/负一律按 1，禁 0%）；
 * ② Hamilton 最大余数法分 100 席（平手=orderedIds 序：基准先、再绑定序）；
 * ③ 0 席钳底：从当前最大席（平手同序）挪 1，循环至全部 ≥1（≤4 档案 Σ=100 必终止）。
 */
export function normalizeWeights(values: Record<string, number>, orderedIds: string[]): Record<string, number> {
  if (orderedIds.length === 0) return {}; // 空勾选：调用方有守卫，此为纯函数自防（除零）
  const clamped = orderedIds.map((id) => {
    const v = Math.trunc(Number(values[id]));
    return Number.isFinite(v) && v >= 1 ? v : 1;
  });
  const total = clamped.reduce((s, n) => s + n, 0);
  const seats = clamped.map((n) => Math.floor((100 * n) / total));
  let left = 100 - seats.reduce((s, n) => s + n, 0);
  const byRemainder = orderedIds
    .map((id, i) => ({ i, rem: (100 * clamped[i]!) / total - seats[i]! }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; left > 0; k += 1, left -= 1) {
    seats[byRemainder[k % byRemainder.length]!.i]! += 1;
  }
  for (;;) {
    const deficient = seats.findIndex((s) => s < 1);
    if (deficient < 0) break;
    let donor = 0;
    for (let i = 1; i < seats.length; i += 1) if (seats[i]! > seats[donor]!) donor = i;
    seats[donor]! -= 1;
    seats[deficient]! += 1;
  }
  const out: Record<string, number> = {};
  orderedIds.forEach((id, i) => {
    out[id] = seats[i]!;
  });
  return out;
}

/** 风格绑定面板（多选融合，DEC-2026-1117-05）：档案勾选（上限 4）+ 基准档案 + 比例区（六轴与范例取样）+ 七维来源收进高级设置；保存经 onBind 发多选 body，解绑发 {profileId:null}。 */
function StyleBindPanel({
  binding,
  profiles,
  onBind,
}: {
  binding: { primaryProfileId: string; auxProfileIds: string[]; dimsSource: Record<string, string>; weights?: Record<string, number> } | null;
  profiles: StyleProfileDto[];
  onBind: (body: StyleBindBody) => void;
}) {
  // 初值由 props.binding 归一（null → 空）；面板只在书加载完成后挂载 + key 重建，首帧不会捕 null
  const [checked, setChecked] = useState<string[]>(() => (binding ? [binding.primaryProfileId, ...binding.auxProfileIds] : []));
  const [primary, setPrimary] = useState<string>(() => binding?.primaryProfileId ?? '');
  const [dims, setDims] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = {};
    for (const d of STYLE_DIMENSIONS) base[d] = binding?.dimsSource?.[d] ?? binding?.primaryProfileId ?? '';
    return base;
  });
  // 用户显式改过的维度键：换基准档案时这些键不跟随重映射
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  // 融合比例：raw 存钳位后未归一整数，保存时 normalizeWeights 归一（防逐键打架）
  const legacyRow = binding !== null && Object.keys(binding.weights ?? {}).length === 0;
  const [rawWeights, setRawWeights] = useState<Record<string, number>>(() => (!legacyRow && binding ? { ...binding.weights } : {}));
  const [weightsTouched, setWeightsTouched] = useState(false);

  const profileOf = (id: string) => profiles.find((p) => p.id === id);
  // 主+已勾辅（主排首）＝七维 select 与比例区的选项序
  const ordered = [primary, ...checked.filter((id) => id !== primary)].filter(Boolean);

  const resetWeightsFor = (np: string, nextIds: string[]) => {
    const newIds = [np, ...nextIds.filter((id) => id !== np)].filter(Boolean);
    if (!legacyRow && newIds.length > 0) {
      setRawWeights(normalizeWeights(Object.fromEntries(newIds.map((id) => [id, 1])), newIds));
    } else {
      setRawWeights({}); // legacy 行保持空不预填；空勾选清空
    }
    setWeightsTouched(false);
  };

  const toggle = (p: StyleProfileDto) => {
    if (checked.includes(p.id)) {
      // 失勾：主失勾回落 checked[0]；dims 中失勾档案的键回落主
      const next = checked.filter((id) => id !== p.id);
      const np = primary === p.id ? (next[0] ?? '') : primary;
      setChecked(next);
      setPrimary(np);
      setDims((prev) => {
        const out = { ...prev };
        for (const d of STYLE_DIMENSIONS) if (out[d] === p.id || (out[d] === primary && !touched.has(d))) out[d] = np;
        return out;
      });
      resetWeightsFor(np, next);
    } else {
      if (checked.length >= 4) return; // 上限 4（1 主 + 3 辅）
      const next = [...checked, p.id];
      const np = primary || p.id;
      setChecked(next);
      if (!primary) {
        setPrimary(p.id);
        setDims((prev) => {
          const out = { ...prev };
          for (const d of STYLE_DIMENSIONS) if (!touched.has(d) && !out[d]) out[d] = p.id;
          return out;
        });
      }
      resetWeightsFor(np, next);
    }
  };

  const changePrimary = (v: string) => {
    setPrimary(v);
    // 换主重映射：值===旧主且未 touched 的键改指新主（否则七键初值永远指旧主，critic 2.4）；比例成员未变不重算（N5）
    setDims((prev) => {
      const out = { ...prev };
      for (const d of STYLE_DIMENSIONS) if (!touched.has(d) && out[d] === primary) out[d] = v;
      return out;
    });
  };

  const save = () => {
    // dims 补齐七键：未显式改的键 = 主
    const dimsSource: Record<string, string> = {};
    for (const d of STYLE_DIMENSIONS) dimsSource[d] = dims[d] || primary;
    const ids = [primary, ...checked.filter((id) => id !== primary)].filter(Boolean);
    const body: StyleBindBody = { primaryProfileId: primary, auxProfileIds: checked.filter((id) => id !== primary), dimsSource };
    // 非 legacy 行恒带 weights（含单档案 {id:100}——修辅权重 0 根因）；legacy 行触碰过才带（N6）
    if ((!legacyRow || weightsTouched) && ids.length > 0) {
      body.weights = normalizeWeights(Object.fromEntries(ids.map((id) => [id, rawWeights[id] ?? 1])), ids);
    }
    onBind(body);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {profiles.map((p) => {
          const isOn = checked.includes(p.id);
          const full = !isOn && checked.length >= 4;
          return (
            <label key={p.id} className="flex items-center gap-1.5 text-sm" title={full ? '最多绑定 4 个（1 主 + 3 辅）' : undefined}>
              <input
                type="checkbox"
                className={checkboxBase}
                aria-label={`风格档案勾选-${p.name}`}
                checked={isOn}
                disabled={full}
                onChange={() => toggle(p)}
              />
              {p.name}（v{p.version}）
            </label>
          );
        })}
      </div>
      <select
        aria-label="基准档案"
        title="规则全量、声线锚、画像默认归属归基准档案"
        className={`${selectBase} w-56`}
        value={primary}
        onChange={(e) => changePrimary(e.target.value)}
      >
        {primary === '' && <option value="">（未选基准档案）</option>}
        {checked.map((id) => {
          const p = profileOf(id);
          if (!p) return null;
          return (
            <option key={id} value={id}>
              {p.name}（v{p.version}）
            </option>
          );
        })}
      </select>
      {checked.length >= 2 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">六轴与范例取样比例</span>
          {legacyRow && <span className="text-xs text-faint">旧绑定：按贡献维数计权（保持原行为）</span>}
          {ordered.map((id) => {
            const p = profileOf(id);
            if (!p) return null;
            return (
              <label key={id} className="flex items-center gap-1">
                {p.name}
                <input
                  type="number"
                  min={1}
                  className={`${inputNarrow} w-16`}
                  aria-label={`比例-${p.name}`}
                  value={rawWeights[id] ?? ''}
                  onChange={(e) => {
                    const n = Math.trunc(Number(e.target.value));
                    setRawWeights({ ...rawWeights, [id]: Number.isFinite(n) && n >= 1 ? n : 1 });
                    setWeightsTouched(true);
                  }}
                />
              </label>
            );
          })}
          <p className="mt-1 w-full text-xs text-faint">
            规则与术语始终为基准全量+辅去重补充，画像各维文本按高级设置取源，不受比例影响
          </p>
        </div>
      )}
      <details className="w-full">
        <summary className="cursor-pointer text-sm">高级设置</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {STYLE_DIMENSIONS.map((d) => (
            <label key={d} className="flex items-center gap-1 text-sm">
              {d}
              <select
                aria-label={`维度来源-${d}`}
                className={`${selectBase} w-44`}
                value={dims[d] ?? ''}
                onChange={(e) => {
                  setDims({ ...dims, [d]: e.target.value });
                  setTouched(new Set(touched).add(d));
                }}
              >
                {ordered.map((id) => {
                  const p = profileOf(id);
                  if (!p) return null;
                  return (
                    <option key={id} value={id}>
                      {p.name}（v{p.version}）
                    </option>
                  );
                })}
              </select>
            </label>
          ))}
        </div>
      </details>
      {/* 无主或零勾选禁用保存：防发 primaryProfileId:'' 吃 400（critic 2.4） */}
      <Button variant="primary" disabled={!primary || checked.length === 0} onClick={save}>
        保存绑定
      </Button>
      <Button variant="secondary" onClick={() => onBind({ profileId: null })}>
        解绑
      </Button>
    </div>
  );
}

/** 人物卡设定展示：baseSetting JSON 逐 entry 拼行，非法 JSON 显示原文，'{}' 显示占位。 */
function settingPreview(baseSetting: string): string {
  const raw = (baseSetting ?? '').trim();
  if (!raw || raw === '{}') return '（无设定）';
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const flat = Object.entries(obj)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join('；');
      return flat || '（无设定）';
    }
  } catch {
    /* 原文展示 */
  }
  return raw;
}

/** 编辑态预填：与展示一致的展平文本（无设定 → 空串）；保存按 {"设定": text} 包裹约定回写。 */
function settingRawText(baseSetting: string): string {
  const p = settingPreview(baseSetting);
  return p === '（无设定）' ? '' : p;
}

export default function BookDetailPage() {
  const { bookId = '' } = useParams();
  const { data: book, refetch } = useQuery({ queryKey: ['book', bookId], queryFn: () => api.getBook(bookId), refetchInterval: 4000 });
  const { data: profiles } = useQuery({ queryKey: ['style-profiles'], queryFn: api.listStyleProfiles, refetchInterval: 5000 });
  const { data: characters, refetch: refetchCharacters } = useQuery({
    queryKey: ['characters', bookId],
    queryFn: () => api.listCharacters(bookId),
  });
  const [blueprintText, setBlueprintText] = useState('');
  const [chapterNo, setChapterNo] = useState(1);
  // B3：本页一枚 select 统管本页三个生成入口（单章/整书/行内），默认 2 = 服务端默认
  const [maxRounds, setMaxRounds] = useState(2);
  // 蓝图编辑区（owner 反馈②④）：章号默认接续末章；字数随章号同步（防 4s 轮询覆盖编辑，仅章号变化时重置）
  const [targetChars, setTargetChars] = useState(3000);
  const [suggesting, setSuggesting] = useState(false);
  const chapterNoInitRef = useRef(false);
  const targetCharsSyncRef = useRef(-1);
  // 人物下线（0009）：每卡行内章号草稿（默认下一章）
  const [offlineDraft, setOfflineDraft] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState('');
  const [worldText, setWorldText] = useState('');
  const [outlineText, setOutlineText] = useState('');
  const [newCardName, setNewCardName] = useState('');
  const [newCardSetting, setNewCardSetting] = useState('');
  const [editingCard, setEditingCard] = useState<{ id: string; name: string; setting: string } | null>(null);
  // L2 两步确认：记录待确认删除的人物卡；取消/成功后收簇
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  // book 每 4s 轮询；世界观/大纲编辑态只在首次加载同步一次，避免轮询覆盖未保存的编辑
  const metaSyncedRef = useRef(false);

  useEffect(() => {
    if (book && !metaSyncedRef.current) {
      setWorldText(book.description);
      setOutlineText(book.outline);
      metaSyncedRef.current = true;
    }
  }, [book]);

  useEffect(() => {
    if (book && book.chapters.length > 0 && blueprintText === '') {
      const ch = book.chapters.find((c) => c.chapterNo === chapterNo) ?? book.chapters[0];
      if (ch.blueprint) setBlueprintText(JSON.stringify(ch.blueprint, null, 2));
    }
  }, [book, chapterNo, blueprintText]);

  // 章号默认接续末章（只初始化一次，不覆盖用户手改）
  useEffect(() => {
    if (book && !chapterNoInitRef.current) {
      const maxNo = book.chapters.reduce((m, c) => Math.max(m, c.chapterNo), 0);
      setChapterNo(maxNo + 1);
      chapterNoInitRef.current = true;
    }
  }, [book]);

  // 字数随章号同步：章号没变就不重置（轮询 book 引用常变，防覆盖用户编辑中的字数）
  useEffect(() => {
    if (book && targetCharsSyncRef.current !== chapterNo) {
      const ch = book.chapters.find((c) => c.chapterNo === chapterNo);
      setTargetChars(ch?.targetChars ?? 3000);
      targetCharsSyncRef.current = chapterNo;
    }
  }, [book, chapterNo]);

  const nextChapterNo = book ? book.chapters.reduce((m, c) => Math.max(m, c.chapterNo), 0) + 1 : 1;

  const saveBlueprint = async () => {
    try {
      const blueprint = JSON.parse(blueprintText) as ChapterBlueprint;
      const ch = book?.chapters.find((c) => c.chapterNo === chapterNo);
      const r = await api.putBlueprint(bookId, chapterNo, {
        title: ch?.title || `第${chapterNo}章`,
        blueprint,
        targetChars,
      });
      setMsg(`蓝图已保存：${r.title}（目标 ${targetChars} 字）`);
      void refetch();
    } catch (e) {
      setMsg(`保存失败：${(e as Error).message}`);
    }
  };

  const suggest = async () => {
    setMsg('');
    setSuggesting(true);
    try {
      const r = await api.suggestBlueprint(bookId, { chapterNo });
      setBlueprintText(JSON.stringify(r.blueprint, null, 2));
      setMsg(`已填入第 ${chapterNo} 章蓝图建议，可编辑后点「保存蓝图」`);
    } catch (e) {
      setMsg(`AI 建议失败：${apiErrorText(e)}（可直接在下方手填蓝图 JSON）`);
    } finally {
      setSuggesting(false);
    }
  };

  const startContinue = async () => {
    setMsg('');
    const ch = book?.chapters.find((c) => c.chapterNo === chapterNo);
    if (!ch?.blueprint) {
      setMsg(`第 ${chapterNo} 章还没有蓝图：请先「保存蓝图」（或用 AI 建议生成）再发起续写`);
      return;
    }
    try {
      const r = await api.createRun({ bookId, fromChapter: chapterNo, toChapter: chapterNo, mode: 'continue', maxRounds });
      setMsg(`续写已入队 run ${r.runId.slice(0, 8)}，进度见右侧「运行」卡`);
    } catch (e) {
      setMsg(`发起续写失败：${apiErrorText(e)}`);
    }
  };

  const generate = async () => {
    const r = await api.generateChapter(bookId, chapterNo, maxRounds);
    setMsg(`已入队 run ${r.runId}`);
  };

  const generateAll = async () => {
    const r = await api.generateAll(bookId, maxRounds);
    setMsg(`整书已入队 run ${r.runId}`);
  };

  const bindStyle = async (body: StyleBindBody): Promise<void> => {
    try {
      await api.bindStyle(bookId, body);
      // 解绑必须真发出去（缺陷⑦）：文案分两条；保存成功显性化 fewshot 归零，不静默
      setMsg(body.profileId === null ? '风格档案已解绑（persona 快照一并清除）' : '风格档案已绑定；绑定保存后文风示例开关已归零');
      void refetch();
    } catch (e) {
      setMsg(`绑定失败：${(e as Error).message}`);
    }
  };

  const saveMeta = async () => {
    try {
      await api.putBookMeta(bookId, { description: worldText, outline: outlineText });
      setMsg('设定已保存');
      void refetch();
    } catch (e) {
      setMsg(`设定保存失败：${(e as Error).message}`);
    }
  };

  const addCard = async () => {
    if (!newCardName.trim()) {
      setMsg('人物卡姓名不能为空');
      return;
    }
    try {
      await api.createCharacter(bookId, {
        name: newCardName.trim(),
        baseSetting: newCardSetting.trim() ? JSON.stringify({ 设定: newCardSetting.trim() }) : '{}',
      });
      setNewCardName('');
      setNewCardSetting('');
      setMsg('人物卡已添加');
      void refetchCharacters();
    } catch (e) {
      setMsg(`添加失败：${(e as Error).message}`);
    }
  };

  const saveCard = async () => {
    if (!editingCard) return;
    try {
      await api.updateCharacter(bookId, editingCard.id, {
        name: editingCard.name.trim(),
        baseSetting: editingCard.setting.trim() ? JSON.stringify({ 设定: editingCard.setting.trim() }) : '{}',
      });
      setEditingCard(null);
      setMsg('人物卡已保存');
      void refetchCharacters();
    } catch (e) {
      setMsg(`保存失败：${(e as Error).message}`);
    }
  };

  const removeCard = async (card: CharacterDto) => {
    try {
      await api.deleteCharacter(bookId, card.id);
      setConfirmingDeleteId(null);
      setMsg(`人物卡「${card.name}」已删除`);
      void refetchCharacters();
    } catch (e) {
      setMsg(`删除失败：${(e as Error).message}`);
    }
  };

  // 人物下线（0009）：第 N 章起不再以在场身份注入写手；连续性快照带「已下线」防复活
  const offlineCard = async (card: CharacterDto) => {
    const ch = offlineDraft[card.id] ?? nextChapterNo;
    try {
      await api.updateCharacter(bookId, card.id, { offlineFromChapter: ch });
      setMsg(`人物「${card.name}」已设为第 ${ch} 章起下线`);
      void refetchCharacters();
    } catch (e) {
      setMsg(`下线失败：${apiErrorText(e)}`);
    }
  };

  const reviveCard = async (card: CharacterDto) => {
    try {
      await api.updateCharacter(bookId, card.id, { offlineFromChapter: null });
      setMsg(`人物「${card.name}」已恢复在场`);
      void refetchCharacters();
    } catch (e) {
      setMsg(`恢复失败：${apiErrorText(e)}`);
    }
  };

  const summarize = async (chapterNo: number) => {
    try {
      await api.summarizeChapter(bookId, chapterNo);
      setMsg(`第${chapterNo}章摘要已生成`);
      void refetch();
    } catch (e) {
      setMsg(`摘要失败：${(e as Error).message}`);
    }
  };

  const [exportFormat, setExportFormat] = useState<ExportFormat>('txt');
  const exportNow = async () => {
    try {
      const r = await api.exportBook(bookId, exportFormat);
      setMsg(`已导出 ${r.files.length} 个文件（${exportFormat}）`);
    } catch (e) {
      setMsg(`导出失败：${(e as Error).message}`);
    }
  };

  const doneCount = (book?.chapters ?? []).filter((c) => c.status === 'done').length;
  const activeSec = useActiveSection(Boolean(book));
  return (
    <main className="mx-auto max-w-6xl px-8 py-8">
      <Link to="/" className="text-sm text-muted hover:text-ink">
        ← 书架
      </Link>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <h1 className="font-display text-[22px] font-semibold">{book?.title ?? '…'}</h1>
        {/* 详情 chip 条（D2） */}
        <Chip active>章节 {book?.chapters.length ?? 0}</Chip>
        <Chip active={doneCount > 0}>完成 {doneCount}</Chip>
        {book?.styleProfileId && (
          <Chip active>
            已绑定 {(book.styleBinding?.auxProfileIds.length ?? 0) + 1} 个（主：
            {(Array.isArray(profiles) ? profiles : []).find((p) => p.id === book.styleProfileId)?.name ?? book.styleProfileId}）
          </Chip>
        )}
        {book?.imitationProfileId && <Chip active>仿写已绑</Chip>}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={generateAll}>
          整书生成
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          质量轮数
          <select
            aria-label="质量轮数"
            className={`${selectBase} w-24`}
            value={maxRounds}
            onChange={(e) => setMaxRounds(Number(e.target.value))}
          >
            <option value={1}>1 轮</option>
            <option value={2}>2 轮</option>
            <option value={3}>3 轮</option>
          </select>
        </label>
        <Button
          variant="quiet"
          iconOnly
          aria-label="刷新"
          title="刷新"
          onClick={() => void refetch()}
        >
          <RefreshCw size={16} strokeWidth={1.8} aria-hidden="true" />
        </Button>
        <span className="ml-auto inline-flex items-center gap-2">
          <select
            aria-label="导出格式"
            className={`${selectBase} w-40`}
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
          >
            <option value="chapters-md">分章 Markdown</option>
            <option value="combined-md">全书合并</option>
            <option value="txt">分章 TXT</option>
          </select>
          <Button variant="secondary" onClick={() => void exportNow()}>
            导出
          </Button>
        </span>
        <span className="w-full text-xs text-faint">导出文件保存到本机 data/exports/，不自动下载</span>
      </div>
      {/* 锚点条（D4）：sticky 跟随，纯文本 <a>；祖先链无 overflow-hidden/auto */}
      <nav aria-label="页面分区" className="sticky top-0 z-10 -mx-8 mt-4 flex flex-wrap items-center gap-1 border-b border-line bg-bg/85 px-8 py-2 backdrop-blur">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
              activeSec === s.id ? 'bg-primary-soft font-medium text-primary-strong' : 'text-muted hover:text-ink'
            }`}
          >
            {s.label}
          </a>
        ))}
      </nav>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">

      <section id="sec-worldview" className="scroll-mt-16 rounded-card border border-line bg-surface">
        <CardHeader title="世界观与剧情大纲" />
        <div className="space-y-2 p-4">
          <textarea
            className={textareaBase}
            rows={6}
            aria-label="世界观"
            placeholder="世界观 / 规则（越具体越好）"
            value={worldText}
            onChange={(e) => setWorldText(e.target.value)}
          />
          <textarea
            className={textareaBase}
            rows={4}
            aria-label="剧情大纲"
            placeholder="全书剧情大纲（可选）：分卷 / 关键转折 / 结局走向"
            value={outlineText}
            onChange={(e) => setOutlineText(e.target.value)}
          />
          <div>
            <Button variant="primary" onClick={() => void saveMeta()}>
              保存设定
            </Button>
          </div>
        </div>
      </section>

      <div id="sec-outline-tree" className="scroll-mt-16">
        {bookId && <OutlineTreeSection bookId={bookId} />}
      </div>

      <div id="sec-foreshadowing" className="scroll-mt-16">
        {bookId && <ForeshadowingsSection bookId={bookId} />}
      </div>

      <section id="sec-characters" className="scroll-mt-16 rounded-card border border-line bg-surface">
        <CardHeader title="人物卡" />
        <div className="p-4">
          <ul className="space-y-2">
            {(characters ?? []).map((c) => (
              <li key={c.id} className="rounded-ctl border border-line px-3 py-2 text-sm">
                {editingCard?.id === c.id ? (
                  <div className="space-y-1">
                    <input
                      className={`${inputNarrow} w-40`}
                      aria-label="编辑姓名"
                      value={editingCard.name}
                      onChange={(e) => setEditingCard({ ...editingCard, name: e.target.value })}
                    />
                    <textarea
                      className={textareaBase}
                      rows={2}
                      aria-label="编辑设定"
                      value={editingCard.setting}
                      onChange={(e) => setEditingCard({ ...editingCard, setting: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm" onClick={() => void saveCard()}>
                        保存
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setEditingCard(null)}>
                        取消
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start gap-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="min-w-0 flex-1 text-muted">{settingPreview(c.baseSetting)}</span>
                    {c.offlineFromChapter != null && <Badge tone="muted">第{c.offlineFromChapter}章起下线</Badge>}
                    {confirmingDeleteId === c.id ? (
                      <>
                        <span className="text-danger text-xs">该人物卡及其历史状态将一并删除，不可恢复。</span>
                        <Button variant="danger" size="sm" solid onClick={() => void removeCard(c)}>
                          确认删除
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setConfirmingDeleteId(null)}>
                          取消
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="quiet"
                          tone="primary"
                          size="sm"
                          onClick={() =>
                            setEditingCard({ id: c.id, name: c.name, setting: settingRawText(c.baseSetting) })
                          }
                        >
                          编辑
                        </Button>
                        {c.offlineFromChapter == null ? (
                          <>
                            <input
                              type="number"
                              min={1}
                              aria-label={`下线章号-${c.name}`}
                              title="从第几章起该角色退场"
                              className={`${inputNarrow} w-16`}
                              value={offlineDraft[c.id] ?? nextChapterNo}
                              onChange={(e) =>
                                setOfflineDraft({ ...offlineDraft, [c.id]: Number(e.target.value) || nextChapterNo })
                              }
                            />
                            <Button variant="quiet" tone="danger" size="sm" onClick={() => void offlineCard(c)}>
                              下线
                            </Button>
                          </>
                        ) : (
                          <Button variant="quiet" tone="primary" size="sm" onClick={() => void reviveCard(c)}>
                            恢复在场
                          </Button>
                        )}
                        <Button variant="quiet" tone="danger" size="sm" onClick={() => setConfirmingDeleteId(c.id)}>
                          删除
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            <input
              className={`${inputNarrow} w-40`}
              placeholder="姓名"
              aria-label="新卡姓名"
              value={newCardName}
              onChange={(e) => setNewCardName(e.target.value)}
            />
            <textarea
              className={textareaBase}
              rows={2}
              placeholder="人物设定（身份 / 性格 / 目标…）"
              aria-label="新卡设定"
              value={newCardSetting}
              onChange={(e) => setNewCardSetting(e.target.value)}
            />
            <Button variant="secondary" size="sm" onClick={() => void addCard()}>
              添加人物
            </Button>
          </div>
        </div>
      </section>

      <section id="sec-style" className="scroll-mt-16 rounded-card border border-line bg-surface">
        <CardHeader title="风格档案" />
        <div className="p-4">
          {/* 书加载完成才挂载 + 换书 key 重建（critic 2.4）：防 useState 初值首帧捕 null 永不重算 */}
          {book ? (
            <StyleBindPanel
              key={book.id}
              binding={book.styleBinding ?? null}
              profiles={Array.isArray(profiles) ? profiles : []}
              onBind={(body) => void bindStyle(body)}
            />
          ) : null}
          <p className="mt-2 text-xs text-faint">续写也注入混合风格：前文腔调优先，文风档案作质感参照。</p>
          {book?.styleProfileId && (
            <div className="mt-2 border-t border-line pt-2">
              <label htmlFor="book-style-fewshot" className="flex items-center gap-2 text-sm font-medium">
                <input
                  id="book-style-fewshot"
                  type="checkbox"
                  className={checkboxBase}
                  checked={book.styleFewshotOn}
                  onChange={(e) => {
                    const next = e.target.checked;
                    void api
                      .setBookFewshot(bookId, next)
                      .then((r) => {
                        setMsg(r.styleFewshotOn ? '文风示例注入已开启' : '文风示例注入已关闭');
                        void refetch();
                      })
                      .catch((err: unknown) => setMsg(apiErrorText(err)));
                  }}
                />
                文风示例注入
              </label>
              <p className="mt-1 text-xs text-faint">
                关闭后不向写手注入范文片段；抄用检测仍以绑定样本为参考，不随开关关闭。新绑定默认关。
              </p>
            </div>
          )}
        </div>
      </section>

      <section id="sec-chapters" className="scroll-mt-16 rounded-card border border-line bg-surface">
        <CardHeader title="章节" />
        <ul className="space-y-1 p-4">
          {(book?.chapters ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-ctl border border-line px-3 py-2">
              <span>
                第{c.chapterNo}章 {c.title}
              </span>
              <Badge tone={c.status === 'done' ? 'ok' : c.status === 'needs_human' ? 'warn' : 'muted'}>{c.status}</Badge>
              {c.isOriginal && (
                <Button variant="quiet" tone="primary" size="sm" onClick={() => void summarize(c.chapterNo)}>
                  补摘要
                </Button>
              )}
              <Button
                variant="quiet"
                tone="primary"
                size="sm"
                className="ml-auto"
                onClick={() => void api.generateChapter(bookId, c.chapterNo, maxRounds).then(() => setMsg(`第${c.chapterNo}章已入队`))}
              >
                生成
              </Button>
              <Link
                className="inline-flex h-8 items-center gap-1.5 rounded-ctl border border-line bg-surface px-3 text-xs text-ink transition-colors hover:bg-bg"
                to={`/books/${bookId}/chapters/${c.chapterNo}`}
              >
                阅读
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section id="sec-blueprint" className="scroll-mt-16 rounded-card border border-line bg-surface">
        <CardHeader title="蓝图编辑" action={<span className="text-xs text-faint">QC 按目标字数 ±10% 校验</span>} />
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted">
              章号
              <input
                type="number"
                min={1}
                className={`${inputNarrow} w-20`}
                value={chapterNo}
                onChange={(e) => setChapterNo(Number(e.target.value) || 1)}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              字数
              <input
                type="number"
                min={500}
                step={100}
                aria-label="本章目标字数"
                className={`${inputNarrow} w-24`}
                value={targetChars}
                onChange={(e) => setTargetChars(Number(e.target.value) || 3000)}
              />
            </label>
            <Button variant="secondary" loading={suggesting} onClick={() => void suggest()}>
              AI 建议蓝图
            </Button>
            <Button variant="primary" onClick={saveBlueprint}>
              保存蓝图
            </Button>
            <Button variant="secondary" onClick={generate}>
              生成本章
            </Button>
            <Button variant="primary" onClick={() => void startContinue()}>
              发起续写（第{chapterNo}章）
            </Button>
          </div>
          <p className="mt-2 text-xs text-faint">
            下一章续写：章号默认接续末章 → 「AI 建议蓝图」或手填 JSON → 「保存蓝图」→ 「发起续写」（取前文锚点声线；「生成本章」则按蓝图全新生成）。
            字数=本章目标字数，QC 按其 ±10% 校验。
          </p>
          <textarea
            className={`${textareaBase} mt-2 h-72 font-mono text-xs`}
            placeholder='蓝图 JSON，如 {"goal":"…","beats":["…"],"mustHaveBeats":[],"bannedTopics":[]}'
            value={blueprintText}
            onChange={(e) => setBlueprintText(e.target.value)}
          />
          {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
        </div>
      </section>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6">
          <RunAsideCard runs={book?.runs ?? []} />
        </aside>
      </div>
    </main>
  );
}
