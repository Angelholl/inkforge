import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import NewBookIdeaPage from './NewBookIdeaPage';

afterEach(() => {
  cleanup();
});

describe('NewBookIdeaPage', () => {
  it('新书占位页渲染说明文案与禁用表单壳', () => {
    render(<NewBookIdeaPage />);

    expect(screen.getByRole('heading', { name: '新书' })).toBeTruthy();
    expect(screen.getByText(/本期尚未开放/)).toBeTruthy();

    const worldview = screen.getByPlaceholderText('世界观预设（如：修真大陆、末世废土…）') as HTMLInputElement;
    expect(worldview.disabled).toBe(true);

    const cast = screen.getByPlaceholderText('角色卡（主角/配角/关系…）') as HTMLTextAreaElement;
    expect(cast.disabled).toBe(true);

    const button = screen.getByRole('button', { name: '生成立项蓝图' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('本期未开放');
  });
});
