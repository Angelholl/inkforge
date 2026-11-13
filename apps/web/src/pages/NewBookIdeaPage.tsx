export default function NewBookIdeaPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">新书</h1>
      <p className="mt-2 text-sm text-gray-500">
        以「立项意向书」起步：预设世界观与角色卡 → 生成蓝图 → 全新成书。该流程本期尚未开放。
      </p>
      <div className="mt-6 space-y-3">
        <input
          className="w-full rounded border px-3 py-2"
          placeholder="世界观预设（如：修真大陆、末世废土…）"
          disabled
        />
        <textarea
          className="w-full rounded border px-3 py-2"
          rows={4}
          placeholder="角色卡（主角/配角/关系…）"
          disabled
        />
        <button className="rounded bg-blue-600 px-4 py-2 text-white" disabled title="本期未开放">
          生成立项蓝图
        </button>
      </div>
    </main>
  );
}
