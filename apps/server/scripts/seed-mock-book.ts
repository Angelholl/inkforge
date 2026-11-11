import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { loadConfig } from '../src/config';
import { openDb } from '../src/db/open';
import { migrate } from '../src/db/migrate';
import { createBook } from '../src/db/repositories/books';
import { upsertBlueprint } from '../src/db/repositories/chapters';

/** 演示种子书（INKFORGE_MOCK=1 语义）：2 章 target 500；打印 bookId。 */
const config = loadConfig(process.env);
const db = openDb(path.join(config.dataDir, 'inkforge.db'));
migrate(db);
const bookId = createBook(db, {
  title: '演示-试炼之路',
  description: '演示用书：mock 模式快速生成。',
  characters: [{ name: '林澈', baseSetting: '{"位置":"塔底"}' }],
}).id;
for (let i = 1; i <= 2; i++) {
  upsertBlueprint(db, {
    bookId,
    chapterNo: i,
    title: `第${i}层`,
    targetChars: 500,
    blueprint: { goal: `试炼第${i}层推进`, beats: [`进入第${i}层`, `收束`], mustHaveBeats: [], bannedTopics: [] },
  });
}
console.log(bookId);
void randomUUID;
db.close();
