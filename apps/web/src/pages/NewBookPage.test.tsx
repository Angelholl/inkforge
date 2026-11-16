import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NewBookPage, { decodeTextFile, splitChapters } from './NewBookPage';

const SAMPLE = `第一章 入山
他背起行囊走进山门。
第二章 旧庙
庙门半掩，尘灰满地。
第三章 夜谈
火光摇曳，老人开口。

第X章 不匹配行不算章题`;

function fetchFor(url: string): Response {
  if (url.endsWith('/api/books')) {
    return new Response(JSON.stringify({ id: 'b1', title: '试炼', chapters: [], runs: [] }), { status: 201 });
  }
  if (url.endsWith('/import-original')) {
    return new Response(JSON.stringify({ imported: 3, firstChapterNo: 1, lastChapterNo: 3 }), { status: 201 });
  }
  return new Response('[]', { status: 200 });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage(initial = '/new') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/new" element={<NewBookPage />} />
          <Route path="/books/:bookId" element={<div>BOOK_DETAIL</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NewBookPage', () => {
  it('拆章预览：粘贴 3 章渲染 3 条且可删一条；文件选择区为虚线底框（回归 owner 反馈①）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => fetchFor(url)),
    );
    renderPage();

    // step1 → 建书
    fireEvent.change(screen.getByPlaceholderText('书名'), { target: { value: '试炼' } });
    const createBtn = screen.getByRole('button', { name: '建书并进入导入' }) as HTMLButtonElement;
    expect(createBtn.className).toContain('bg-primary');
    expect(createBtn.className).toContain('h-ctl');
    fireEvent.click(createBtn);
    await waitFor(() => screen.getByPlaceholderText(/粘贴全文/));

    // 文件选择区：虚线底框 label（不再是无样式的原生 file input）
    const dropLabel = screen.getByText(/点击选择本地 txt \/ md 文件/).closest('label') as HTMLElement;
    expect(dropLabel.className).toContain('border-dashed');
    expect(dropLabel.className).toContain('rounded');
    expect(dropLabel.getAttribute('for')).toBe('import-original-file');
    const fileInput = document.getElementById('import-original-file') as HTMLInputElement;
    expect(fileInput.type).toBe('file');
    expect(fileInput.className).toContain('hidden');

    // step2 → 粘贴 + 拆章预览
    fireEvent.change(screen.getByPlaceholderText(/粘贴全文/), { target: { value: SAMPLE } });
    const previewBtn = screen.getByRole('button', { name: '拆章预览' }) as HTMLButtonElement;
    expect(previewBtn.className).toContain('border-line');
    expect(previewBtn.className).toContain('h-ctl');
    const importBtn = screen.getByRole('button', { name: /导入 0 章/ }) as HTMLButtonElement;
    expect(importBtn.className).toContain('bg-primary');
    expect(importBtn.className).toContain('disabled:opacity-45');
    fireEvent.click(previewBtn);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);

    // 删除一条 → 2 条
    const delBtn = screen.getAllByRole('button', { name: '删除' })[0] as HTMLButtonElement;
    expect(delBtn.className).toContain('text-danger');
    expect(delBtn.className).toContain('h-8');
    fireEvent.click(screen.getAllByRole('button', { name: '删除' })[1]);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('导入成功 → 直接跳转书详情页（回归 owner 反馈②④：统一落点，不再有向导第三步）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => fetchFor(url)),
    );
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('书名'), { target: { value: '试炼' } });
    fireEvent.click(screen.getByRole('button', { name: '建书并进入导入' }));
    await waitFor(() => screen.getByPlaceholderText(/粘贴全文/));
    fireEvent.change(screen.getByPlaceholderText(/粘贴全文/), { target: { value: SAMPLE } });
    fireEvent.click(screen.getByRole('button', { name: '拆章预览' }));
    fireEvent.click(screen.getByRole('button', { name: /导入 3 章/ }));

    // 落点=书详情页；向导第三步不复存在
    await waitFor(() => expect(screen.getByText('BOOK_DETAIL')).toBeTruthy());
    expect(screen.queryByPlaceholderText(/蓝图 JSON/)).toBeNull();
    expect(screen.queryByRole('button', { name: /发起续写/ })).toBeNull();
  });

  it('文件选择：GBK 字节经 decodeTextFile 正确解码并回显文件名与编码（回归 owner 反馈③）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => fetchFor(url)),
    );
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('书名'), { target: { value: '试炼' } });
    fireEvent.click(screen.getByRole('button', { name: '建书并进入导入' }));
    await waitFor(() => screen.getByPlaceholderText(/粘贴全文/));

    // 「第一章 你好」的 GBK 字节（第 B5DA 一 D2BB 章 D5C2 空 20 你 C4E3 好 BAC3）
    const gbk = new Uint8Array([0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2, 0x20, 0xc4, 0xe3, 0xba, 0xc3]);
    const file = new File([gbk], '旧稿.txt', { type: 'text/plain' });
    const fileInput = document.getElementById('import-original-file') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    // textarea 收到 GBK 正确解码文本，不是 U+FFFD 乱码
    await waitFor(() => {
      const ta = screen.getByPlaceholderText(/粘贴全文/) as HTMLTextAreaElement;
      expect(ta.value).toBe('第一章 你好');
    });
    expect(screen.getByText(/旧稿\.txt · 已按 GB18030 解码/)).toBeTruthy();
  });

  it('decodeTextFile：UTF-8 / UTF-8 BOM / UTF-16LE BOM 定码正确', () => {
    const utf8 = new TextEncoder().encode('第一章 雪落');
    expect(decodeTextFile(utf8.buffer as ArrayBuffer).encoding).toBe('UTF-8');
    expect(decodeTextFile(utf8.buffer as ArrayBuffer).text).toBe('第一章 雪落');

    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
    const bomRes = decodeTextFile(withBom.buffer as ArrayBuffer);
    expect(bomRes.encoding).toBe('UTF-8');
    expect(bomRes.text).toBe('第一章 雪落');

    const le = new Uint8Array([0xff, 0xfe, 0x60, 0x4f, 0x7d, 0x59]); // BOM + 「你好」UTF-16LE（低字节在前）
    const leRes = decodeTextFile(le.buffer as ArrayBuffer);
    expect(leRes.encoding).toBe('UTF-16LE');
    expect(leRes.text).toBe('你好');
  });

  it('splitChapters：零章题命中 → 整篇单章', () => {
    const out = splitChapters('只有一段没有章题的文字。');
    expect(out).toHaveLength(1);
    expect(out[0].content).toContain('没有章题');
  });

  it('splitChapters：括号章题「（一）/（二）」拆章（回归 owner 反馈：括号形态无法识别）', () => {
    const out = splitChapters('（一）雪夜\n夜里落了雪。\n\n（二）天明\n天亮出了太阳。');
    expect(out).toHaveLength(2);
    expect(out[0].title).toBe('（一）雪夜');
    expect(out[1].title).toBe('（二）天明');
    expect(out[0].content).toContain('夜里落了雪');
    expect(out[1].content).toContain('天亮出了太阳');
  });

  it('splitChapters：顿号章题「一、/十二、」拆章', () => {
    const out = splitChapters('一、雪夜\n正文甲。\n\n十二、天明\n正文乙。');
    expect(out).toHaveLength(2);
    expect(out[0].title).toBe('一、雪夜');
    expect(out[1].title).toBe('十二、天明');
  });

  it('splitChapters：空格排版「第 1 章」识别', () => {
    const out = splitChapters('第 1 章 雪夜\n正文一。\n\n第 2 章 天明\n正文二。');
    expect(out).toHaveLength(2);
    expect(out[0].title).toBe('第 1 章 雪夜');
    expect(out[1].title).toBe('第 2 章 天明');
  });

  it('splitChapters：防误判——顿号复现行/（完）/小数行不当章题切分', () => {
    const out = splitChapters('第一章 雪夜\n他数着：一、二、三，报数。\n（完）\n全程 1.5 万字。');
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('第一章 雪夜');
    expect(out[0].content).toContain('一、二、三');
    expect(out[0].content).toContain('（完）');
    expect(out[0].content).toContain('1.5 万');
  });
});
