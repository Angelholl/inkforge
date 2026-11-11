import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { openDb } from '../src/db/open';
import { migrate } from '../src/db/migrate';

/** 挂机种子书：挂机-试炼之路，20 章，target_chars=3000；打印 bookId。 */
const dataDir = process.env.INKFORGE_DATA_DIR ?? path.resolve(process.cwd(), 'data');
const db = openDb(path.join(dataDir, 'inkforge.db'));
migrate(db);

const now = new Date().toISOString();
const bookId = randomUUID();
db.prepare('INSERT INTO books(id, title, description, created_at, updated_at) VALUES(?,?,?,?,?)').run(
  bookId,
  '挂机-试炼之路',
  '这是一座修行试炼塔，每层试炼独立成篇。少年林澈自塔底登临，逐层破解试炼，遇见故人与敌手，收束前尘伏笔。全书基调冷峻克制，节拍紧凑。',
  now,
  now,
);
db.prepare('INSERT INTO characters(id, book_id, name, base_setting, created_at) VALUES(?,?,?,?,?)').run(
  randomUUID(),
  bookId,
  '林澈',
  '{"位置":"塔底","持有":["青铜令牌"],"状态":"健康"}',
  now,
);

const insertChapter = db.prepare(
  'INSERT INTO chapters(id, book_id, chapter_no, title, blueprint_json, target_chars, created_at) VALUES(?,?,?,?,?,?,?)',
);
for (let i = 1; i <= 20; i++) {
  const blueprint = {
    goal: `主角在试炼第${i}层推进`,
    beats: [`进入第${i}层`, `遭遇第${i}层试炼`, `第${i}层收束与抉择`],
    mustHaveBeats: [],
    bannedTopics: [],
  };
  insertChapter.run(randomUUID(), bookId, i, `第${i}层`, JSON.stringify(blueprint), 3000, now);
}
console.log(bookId);
db.close();
