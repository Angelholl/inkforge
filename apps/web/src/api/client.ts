import type {
  BookDto,
  ReportDto,
  ChapterDto,
  CreateBookBody,
  BlueprintSuggestBody,
  OutlineSuggestBody,
  OutlineSuggestResult,
  OutlineTreeDto,
  OutlineTreeSuggestBody,
  OutlineTreeSuggestResult,
  OutlineTreeGetResult,
  OutlineCheckResult,
  CreateRunBody,
  ImportOriginalBody,
  ImportOriginalResult,
  HealthDto,
  RunDto,
  RunWithStepsDto,
  VersionDto,
  BlueprintPutBody,
  StyleProfileDto,
  StyleBindBody,
  DistillStyleBody,
  BookMetaPutBody,
  CharacterDto,
  CreateCharacterBody,
  UpdateCharacterBody,
} from '@inkforge/shared';

export function resolveApiBase(isDev: boolean): string {
  return isDev ? '' : 'http://127.0.0.1:8787';
}

export const API_BASE = resolveApiBase(import.meta.env.DEV);

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${url}`, {
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
  deleteBook: (bookId: string) => req<{ ok: boolean }>(`/api/books/${bookId}`, { method: 'DELETE', body: '{}' }),
  putBookMeta: (bookId: string, body: BookMetaPutBody) =>
    req<BookDto>(`/api/books/${bookId}/meta`, { method: 'PUT', body: JSON.stringify(body) }),
  listCharacters: (bookId: string) => req<CharacterDto[]>(`/api/books/${bookId}/characters`),
  createCharacter: (bookId: string, body: CreateCharacterBody) =>
    req<CharacterDto>(`/api/books/${bookId}/characters`, { method: 'POST', body: JSON.stringify(body) }),
  updateCharacter: (bookId: string, characterId: string, body: UpdateCharacterBody) =>
    req<CharacterDto>(`/api/books/${bookId}/characters/${characterId}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteCharacter: (bookId: string, characterId: string) =>
    req<{ ok: boolean }>(`/api/books/${bookId}/characters/${characterId}`, { method: 'DELETE', body: '{}' }),
  putBlueprint: (bookId: string, chapterNo: number, body: BlueprintPutBody) =>
    req<ChapterDto>(`/api/books/${bookId}/chapters/${chapterNo}/blueprint`, { method: 'PUT', body: JSON.stringify(body) }),
  generateChapter: (bookId: string, chapterNo: number, maxRounds?: number) =>
    req<{ runId: string }>(`/api/books/${bookId}/chapters/${chapterNo}/generate`, {
      method: 'POST',
      body: JSON.stringify({ maxRounds }),
    }),
  generateAll: (bookId: string) => req<{ runId: string }>(`/api/books/${bookId}/generate-all`, { method: 'POST', body: '{}' }),
  importOriginal: (bookId: string, body: ImportOriginalBody) =>
    req<ImportOriginalResult>(`/api/books/${bookId}/import-original`, { method: 'POST', body: JSON.stringify(body) }),
  suggestBlueprint: (bookId: string, body: BlueprintSuggestBody) =>
    req<{ blueprint: unknown; source: 'llm' | 'manual' }>(`/api/books/${bookId}/blueprint-suggest`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  suggestOutline: (bookId: string, body: OutlineSuggestBody) =>
    req<OutlineSuggestResult>(`/api/books/${bookId}/outline-suggest`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  suggestOutlineTree: (bookId: string, body: OutlineTreeSuggestBody) =>
    req<OutlineTreeSuggestResult>(`/api/books/${bookId}/outline-tree-suggest`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getOutlineTree: (bookId: string) =>
    req<OutlineTreeGetResult>(`/api/books/${bookId}/outline-tree`),
  putOutlineTree: (bookId: string, tree: OutlineTreeDto) =>
    req<OutlineTreeGetResult>(`/api/books/${bookId}/outline-tree`, {
      method: 'PUT',
      body: JSON.stringify({ tree }),
    }),
  checkOutline: (bookId: string, upToChapter?: number) =>
    req<OutlineCheckResult>(`/api/books/${bookId}/outline-check`, {
      method: 'POST',
      body: JSON.stringify(upToChapter ? { upToChapter } : {}),
    }),
  createRun: (body: CreateRunBody) => req<{ runId: string }>('/api/runs', { method: 'POST', body: JSON.stringify(body) }),
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
  listStyleProfiles: () => req<StyleProfileDto[]>('/api/style-profiles'),
  distillStyle: (body: DistillStyleBody) =>
    req<{ profileId: string }>('/api/style-profiles/distill', { method: 'POST', body: JSON.stringify(body) }),
  summarizeChapter: (bookId: string, chapterNo: number) =>
    req<{ ok: boolean }>(`/api/books/${bookId}/chapters/${chapterNo}/summarize`, { method: 'POST', body: '{}' }),
  bindStyle: (bookId: string, body: StyleBindBody) =>
    req<{ ok: boolean; styleProfileId: string }>(`/api/books/${bookId}/style`, { method: 'PUT', body: JSON.stringify(body) }),
  rewriteSelection: (versionId: string, selection: string, instruction: string) =>
    req<VersionDto>(`/api/versions/${versionId}/rewrite-selection`, {
      method: 'POST',
      body: JSON.stringify({ selection, instruction }),
    }),
};

export const SSE_BASE = API_BASE;
export function runEventsUrl(runId: string): string {
  return `${API_BASE}/api/runs/${runId}/events`;
}
