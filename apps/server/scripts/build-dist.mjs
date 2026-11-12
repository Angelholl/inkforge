#!/usr/bin/env node
/**
 * T-06 打包产物构建：esbuild 双入口 bundle + external 依赖闭包 staging。
 *
 * 产物落点（随 Tauri 包分发，pnpm symlink 过 NSIS 会断，故全部 dereference 成实体）：
 *   apps/desktop/src-tauri/resources/server/server.mjs
 *   apps/desktop/src-tauri/resources/server/worker/worker.mjs
 *   apps/desktop/src-tauri/resources/server/node_modules/<pkg>/...
 *   apps/desktop/src-tauri/resources/server/{db/migrations,config/quality}
 *   apps/desktop/src-tauri/resources/web/dist
 *
 * 可重复执行：每次先清空 server / web 两个 stage 目录再产。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const scriptDir = path.dirname(fileURLToPath(import.meta.url)); // apps/server/scripts
const serverDir = path.resolve(scriptDir, '..'); // apps/server
const repoRoot = path.resolve(serverDir, '../..');
const webDir = path.join(repoRoot, 'apps/web');
const resourcesDir = path.join(repoRoot, 'apps/desktop/src-tauri/resources');

const stageServer = path.join(resourcesDir, 'server');
const stageWeb = path.join(resourcesDir, 'web');

/** 运行时恒等 external：保留 import，由随包 node_modules 提供。 */
const EXTERNALS = ['fastify', '@fastify/cors', '@fastify/static', 'better-sqlite3', 'koffi', 'zod'];

const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  splitting: false,
  sourcemap: false,
  logLevel: 'info',
  external: EXTERNALS,
};

/** 解析 <pkg>/package.json 的物理路径（优先 exports 直取，缺失时回退到入口向上找同名 package.json）。 */
function resolvePackageJson(pkgName, fromDir) {
  const req = createRequire(pathToFileURL(path.join(fromDir, 'package.json')));
  try {
    return req.resolve(`${pkgName}/package.json`);
  } catch {
    const entry = req.resolve(pkgName); // 包未导出 ./package.json
    let dir = path.dirname(entry);
    while (true) {
      const candidate = path.join(dir, 'package.json');
      if (fs.existsSync(candidate)) {
        const meta = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        if (meta.name === pkgName) return candidate;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    throw new Error(`[build-dist] 无法定位 ${pkgName} 的 package.json（from ${fromDir}）`);
  }
}

/** 复制过滤：不含 .ignored / .bin 目录段。 */
function stageFilter(src) {
  const segments = src.split(path.sep);
  return !segments.includes('.ignored') && !segments.includes('.bin');
}

function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true, dereference: true, filter: stageFilter });
}

/** 读取一个包的元数据 + 其 dependencies / optionalDependencies（跳过 dev / peer）。 */
function loadPackage(pkgName, fromDir) {
  const pkgJsonPath = resolvePackageJson(pkgName, fromDir);
  const realDir = fs.realpathSync(path.dirname(pkgJsonPath));
  const meta = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const deps = Object.keys(meta.dependencies ?? {});
  const optional = Object.keys(meta.optionalDependencies ?? {}).filter((d) => !deps.includes(d));
  return { name: pkgName, realDir, deps, optional };
}

/**
 * external 闭包 staging 布局（npm 语义）：dependencies + optionalDependencies（跳过 dev/peer）。
 *
 * pnpm 的物理树里同名包可能有多版本（如 fast-uri@3 与 @4），扁平放一层放不下：
 * 能提升到顶层 node_modules 的版本提升；与顶层已有版本不同的，嵌套在依赖方
 * `<pkg>/node_modules/` 下，保证 Node 解析语义正确且全程无 symlink。
 * 仅当同一目标路径被要求落两个不同 realpath 时才 fail loud（布局本身不可能成立）。
 */
function buildClosureLayout() {
  /** @type {Map<string, {name:string, realDir:string}>} 目标绝对路径 -> 包 */
  const placed = new Map();
  /** @type {Array<{node:{name:string,realDir:string}, dir:string}>} */
  const queue = [];

  const findPlaced = (pkgName, fromDir) => {
    let dir = fromDir;
    for (;;) {
      const candidate = path.join(dir, 'node_modules', ...pkgName.split('/'));
      if (placed.has(candidate)) return placed.get(candidate);
      if (path.resolve(dir) === path.resolve(stageServer)) return null;
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  };

  const place = (node, hostDir) => {
    const dest = path.join(hostDir, 'node_modules', ...node.name.split('/'));
    const existing = placed.get(dest);
    if (existing) {
      if (existing.realDir !== node.realDir) {
        throw new Error(
          `[build-dist] ${node.name} 同一落点要求两个不同 realpath，布局无法成立：\n  ${existing.realDir}\n  ${node.realDir}\n  落点：${dest}`,
        );
      }
      return;
    }
    placed.set(dest, node);
    queue.push({ node, dir: dest });
  };

  // 顶层：6 个 external
  for (const pkgName of EXTERNALS) {
    place(loadPackage(pkgName, serverDir), stageServer);
  }

  // BFS：逐包展开依赖
  const skippedOptional = [];
  for (let i = 0; i < queue.length; i++) {
    const { node, dir } = queue[i];
    const deps = [...node.deps.map((d) => ({ dep: d, optional: false })), ...node.optional.map((d) => ({ dep: d, optional: true }))];

    for (const { dep, optional } of deps) {
      let target;
      try {
        target = loadPackage(dep, node.realDir);
      } catch {
        // 平台相关 optional 依赖未安装（fsevents / 其它平台 prebuild 包）属正常，跳过。
        if (optional) {
          skippedOptional.push(`${node.name} -> ${dep}`);
          continue;
        }
        throw new Error(`[build-dist] 依赖解析失败：${node.name} -> ${dep}（${node.realDir}）`);
      }

      const visible = findPlaced(dep, dir);
      if (visible) {
        if (visible.realDir === target.realDir) continue; // 已可解析到同版本
        place(target, dir); // 版本冲突：嵌套在依赖方下
        continue;
      }
      // 顶层空位则提升，否则就近嵌套
      const topSlot = path.join(stageServer, 'node_modules', ...dep.split('/'));
      if (!placed.has(topSlot)) place(target, stageServer);
      else place(target, dir);
    }
  }

  if (skippedOptional.length > 0) {
    console.log(`[build-dist] 跳过 ${skippedOptional.length} 个未安装的 optionalDependency（平台无关包，正常）：${skippedOptional.join(', ')}`);
  }

  return placed;
}

async function main() {
  // 1. 清空 stage（可重复执行）
  fs.rmSync(stageServer, { recursive: true, force: true });
  fs.rmSync(stageWeb, { recursive: true, force: true });
  fs.mkdirSync(path.join(stageServer, 'worker'), { recursive: true });

  // 2. esbuild 双入口
  await esbuild.build({
    ...commonOptions,
    entryPoints: [path.join(serverDir, 'src/index.ts')],
    outfile: path.join(stageServer, 'server.mjs'),
  });
  await esbuild.build({
    ...commonOptions,
    entryPoints: [path.join(serverDir, 'src/worker/main.ts')],
    outfile: path.join(stageServer, 'worker/worker.mjs'),
  });

  // 3. external 闭包 staging（dereference，全程无 symlink）
  const layout = buildClosureLayout();
  for (const [dest, node] of layout) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    copyDir(node.realDir, dest);
  }
  console.log(`[build-dist] staged ${layout.size} package dirs into node_modules`);

  // 4. 资源拷贝
  copyDir(path.join(webDir, 'dist'), path.join(stageWeb, 'dist'));
  copyDir(
    path.join(serverDir, 'config/quality'),
    path.join(stageServer, 'config/quality'),
  );
  fs.mkdirSync(path.join(stageServer, 'db/migrations'), { recursive: true });
  const migrationsDir = path.join(serverDir, 'src/db/migrations');
  const migrations = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  for (const file of migrations) {
    fs.copyFileSync(path.join(migrationsDir, file), path.join(stageServer, 'db/migrations', file));
  }
  console.log(`[build-dist] copied ${migrations.length} migrations`);

  console.log('[build-dist] done');
}

main().catch((e) => {
  console.error('[build-dist] fatal:', e?.stack ?? e);
  process.exit(1);
});
