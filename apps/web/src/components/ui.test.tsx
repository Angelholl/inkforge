import { render, screen, cleanup, queryByAttribute } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from './ui';

afterEach(() => {
  cleanup();
});

describe('Button', () => {
  it('四变体 class：primary/secondary/danger/danger+solid/quiet 三 tone', () => {
    render(<Button variant="primary">主操作</Button>);
    const primary = screen.getByRole('button', { name: '主操作' }).className;
    expect(primary).toContain('bg-primary');
    expect(primary).toContain('text-white');
    expect(primary).toContain('hover:bg-primary-strong');

    render(<Button>次操作</Button>);
    const secondary = screen.getByRole('button', { name: '次操作' }).className;
    expect(secondary).toContain('border-line');
    expect(secondary).toContain('bg-surface');

    render(<Button variant="danger">停止</Button>);
    const danger = screen.getByRole('button', { name: '停止' }).className;
    expect(danger).toContain('border-danger/40');
    expect(danger).toContain('bg-danger-soft');

    render(<Button variant="danger" solid>确认删除</Button>);
    const solid = screen.getByRole('button', { name: '确认删除' }).className;
    expect(solid).toContain('bg-danger');
    expect(solid).toContain('text-white');
    expect(solid).not.toContain('border-danger/40');

    render(<Button variant="quiet">编辑</Button>);
    expect(screen.getByRole('button', { name: '编辑' }).className).toContain('text-muted');

    render(<Button variant="quiet" tone="primary">查看</Button>);
    expect(screen.getByRole('button', { name: '查看' }).className).toContain('text-primary-strong');

    render(<Button variant="quiet" tone="danger">移除</Button>);
    expect(screen.getByRole('button', { name: '移除' }).className).toContain('text-danger');
  });

  it('尺寸：默认 md / size=sm / iconOnly 方形', () => {
    render(<Button>常规</Button>);
    expect(screen.getByRole('button', { name: '常规' }).className).toContain('h-ctl px-3.5 text-sm');

    render(<Button size="sm">紧凑</Button>);
    expect(screen.getByRole('button', { name: '紧凑' }).className).toContain('h-8 px-2.5 text-xs');

    render(<Button iconOnly aria-label="方钮">x</Button>);
    expect(screen.getByRole('button', { name: '方钮' }).className).toContain('w-8 px-0');
  });

  it('disabled：基类含禁用态 class', () => {
    render(<Button disabled>禁用</Button>);
    const cls = screen.getByRole('button', { name: '禁用' }).className;
    expect(cls).toContain('disabled:opacity-45');
    expect(cls).toContain('disabled:cursor-not-allowed');
  });

  it('focus-visible：基类含主色描边（全变体统一）', () => {
    render(<Button variant="primary">焦点</Button>);
    const cls = screen.getByRole('button', { name: '焦点' }).className;
    expect(cls).toContain('focus-visible:outline-2');
    expect(cls).toContain('focus-visible:outline-primary');
  });

  it('accessible name：文字钮命中，iconOnly 走 aria-label', () => {
    render(<Button variant="quiet">删除</Button>);
    expect(screen.getByRole('button', { name: '删除' })).toBeTruthy();

    render(<Button variant="quiet" iconOnly aria-label="移除">x</Button>);
    expect(screen.getByRole('button', { name: '移除' })).toBeTruthy();
  });

  it('loading：aria-busy+disabled+保宽 span+spinner；非 loading 无 aria-busy', () => {
    const loading = render(<Button loading>保存中</Button>);
    const btn = loading.container.querySelector('button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.disabled).toBe(true);
    const span = btn.querySelector('span.invisible');
    expect(span?.textContent).toBe('保存中');
    expect(btn.querySelector('.animate-spin')).toBeTruthy();

    const idle = render(<Button>保存</Button>);
    expect(queryByAttribute('aria-busy', idle.container, 'true')).toBeNull();
  });

  it('className 透传：ml-auto 出现在最终 class 串', () => {
    render(<Button className="ml-auto">透传</Button>);
    expect(screen.getByRole('button', { name: '透传' }).className).toContain('ml-auto');
  });
});
