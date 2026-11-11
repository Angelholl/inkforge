import type {
  BookDto,
  ReportDto,
  ChapterDto,
  CreateBookBody,
  HealthDto,
  RunDto,
  RunWithStepsDto,
  VersionDto,
  BlueprintPutBody,
} from '@inkforge/shared';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!r.ok) throw new Error(`${init?.method ?? 'GET'} ${url} → ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

export const api = {
  health: () => req<HealthDto>('/api/health'),
  listBooks: () => req<BookDto[]>('/api/books'),
  getBook: (bookId: string) => req<BookDto & { chapters: ChapterDto[]; runs: RunDto[] }>(`/api/books/${bookId}`),
  createBook: (body: CreateBookBody) => req<BookDto>('/api/books', { method: 'POST', body: JSON.stringify(body) }),
  putBlueprint: (bookId: string, chapterNo: number, body: BlueprintPutBody) =>
    req<ChapterDto>(`/api/books/${bookId}/chapters/${chapterNo}/blueprint`, { method: 'PUT', body: JSON.stringify(body) }),
  generateChapter: (bookId: string, chapterNo: number, maxRounds?: number) =>
    req<{ runId: string }>(`/api/books/${bookId}/chapters/${chapterNo}/generate`, {
      method: 'POST',
      body: JSON.stringify({ maxRounds }),
    }),
  generateAll: (bookId: string) => req<{ runId: string }>(`/api/books/${bookId}/generate-all`, { method: 'POST', body: '{}' }),
  getRun: (runId: string) => req<RunWithStepsDto>(`/api/runs/${runId}`),
  cancelRun: (runId: string) => req<{ ok: boolean }>(`/api/runs/${runId}/cancel`, { method: 'POST', body: '{}' }),
  pauseRun: (runId: string) => req<{ ok: boolean }>(`/api/runs/${runId}/pause`, { method: 'POST', body: '{}' }),
  resumeRun: (runId: string) => req<{ ok: boolean }>(`/api/runs/${runId}/resume`, { method: 'POST', body: '{}' }),
  rerunChapter: (runId: string, chapterNo: number) =>
    req<{ runId: string }>(`/api/runs/${runId}/chapters/${chapterNo}/rerun`, { method: 'POST', body: '{}' }),
  listVersions: (bookId: string, chapterNo: number) =>
    req<VersionDto[]>(`/api/books/${bookId}/chapters/${chapterNo}/versions`),
  getVersion: (versionId: string) => req<VersionDto>(`/api/versions/${versionId}`),
  rollback: (versionId: string) =>
    req<{ ok: boolean; currentVersionId: string }>(`/api/versions/${versionId}/rollback`, { method: 'POST', body: '{}' }),
  exportBook: (bookId: string) => req<{ files: string[] }>(`/api/books/${bookId}/export`, { method: 'POST', body: '{}' }),
  adoptPartial: (runId: string, chapterNo: number) =>
    req<VersionDto>(`/api/runs/${runId}/chapters/${chapterNo}/partial/adopt`, { method: 'POST', body: '{}' }),
  getReport: (runId: string) => req<ReportDto>(`/api/runs/${runId}/report`),
  rewriteSelection: (versionId: string, selection: string, instruction: string) =>
    req<VersionDto>(`/api/versions/${versionId}/rewrite-selection`, {
      method: 'POST',
      body: JSON.stringify({ selection, instruction }),
    }),
};

export const SSE_BASE = '';
export function runEventsUrl(runId: string): string {
  return `${SSE_BASE}/api/runs/${runId}/events`;
}
