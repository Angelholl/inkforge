-- 0009：人物下线（owner 四反馈拍板：专用下线控件）
-- NULL=在场；N=第 N 章（含）起下线——写作管线对 >=N 的章不再以在场身份注入该角色，
-- 连续性快照以「[已下线]」行承载防复活信息。置回 NULL 即恢复在场。
ALTER TABLE characters ADD COLUMN offline_from_chapter INTEGER;
