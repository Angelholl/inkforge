import path from 'node:path';
import { loadConfig } from '../config';
import { openDb } from '../db/open';
import { migrate } from '../db/migrate';
import { createAnthropicProvider } from '../llm/anthropic';
import { createDefaultMockProvider } from '../llm/mock';
import { distillStyleProfile } from './distill';
import { pickFewShotSamples, sampleReferenceText } from './sample';
import { computeStyleMetrics } from './metrics';
import fs from 'node:fs';

/** CLI：pnpm --filter @inkforge/server exec tsx src/style/cli.ts distill --source <path> --name <名称> */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const getArg = (n: string) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : undefined;
  };
  if (cmd !== 'distill') {
    console.error('用法: cli.ts distill --source <path> --name <名称>');
    process.exit(1);
  }
  const sourcePath = getArg('--source');
  const name = getArg('--name') ?? '未命名档案';
  if (!sourcePath) {
    console.error('缺少 --source');
    process.exit(1);
  }
  if (!fs.existsSync(sourcePath) || fs.readFileSync(sourcePath, 'utf8').replace(/\s/g, '') === '') {
    console.error('样本为空，禁止蒸馏');
    process.exit(1);
  }
  const config = loadConfig(process.env);
  const db = openDb(path.join(config.dataDir, 'inkforge.db'));
  migrate(db);
  const provider = config.mock ? createDefaultMockProvider() : createAnthropicProvider(config.providers.local);
  const samples = pickFewShotSamples(fs.readFileSync(sourcePath, 'utf8'));
  const segments = sampleReferenceText(fs.readFileSync(sourcePath, 'utf8'));
  const profileId = await distillStyleProfile({ db, provider }, { name, sourcePath, samples });
  console.log(`profileId=${profileId}  samples=${samples.length}  segments=${segments.length}`);
  console.log(`metrics=${JSON.stringify(computeStyleMetrics(fs.readFileSync(sourcePath, 'utf8')))}`);
  db.close();
}

void main().catch((e) => {
  console.error('[style-cli] fatal:', (e as Error).message);
  process.exit(1);
});
