// 测试封闭性：loadConfig 会合并设置文件（configFilePath() 默认 ~/.inkforge/config.json）。
// 该文件是装机/设置页写入面（DEC-2026-1112-02），若不隔离，宿主家目录的写入会污染测试，测试写入也会污染宿主。
// 每个测试文件 worker 启动时重设（settings.test 自管变量后的 delete 由下一文件的 setup 覆盖兜底）。
import os from 'node:os';
import path from 'node:path';

process.env.INKFORGE_CONFIG_FILE = path.join(os.tmpdir(), 'inkforge-vitest-settings.json');
