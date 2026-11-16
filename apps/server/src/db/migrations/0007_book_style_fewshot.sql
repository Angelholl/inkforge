-- 0007：文风示例逐书开关（DEC-2026-1116-01 裁决④：全局默认关，逐书开）
-- DEFAULT 0 = 既有书与新绑定书默认不注入范文片段；开关只管注入，抄用检测恒取绑定样本。
ALTER TABLE books ADD COLUMN style_fewshot_on INTEGER NOT NULL DEFAULT 0;
