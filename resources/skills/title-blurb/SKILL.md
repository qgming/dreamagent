---
name: title-blurb
description: |
  书名简介标签（造梦师）：读定位节点/核心实体，产出可点击门面；写回作品定位节点（可双链），不写进文章正文。
  Use when: 起书名、写简介、取标签、封面文案、上架包装。
  触发方式：/title-blurb、/起名、/简介、「起个书名」
metadata:
  displayName: 起名简介
  version: "3.0.0"
---

# title-blurb

只做门面，不写章节正文。

## 造梦师领域模型（必须遵守）

项目由三类对象 + 双链图构成：

| 对象 | 存什么 | 状态 | 正文双链 |
|------|--------|------|----------|
| **节点 Beat** | 节拍/大纲/任务/定位等结构单元 | `idea → outline → draft → final` | **允许** |
| **实体 Entity** | 人物、势力、设定、物件、风格基因等 | `active / dormant / archived` | **允许** |
| **文章 Chapter** | 面向读者的成稿正文 | `draft / final` | **禁止** |

### 双链

- 语法：`[@显示名](entity:实体id)` 或 `[@显示名](beat:节点id)`
- **只写在节点/实体的 content 里**；系统会维护 `entityRefs` / `beatRefs`
- **文章 content 必须是纯文本**，禁止任何 `[@…](beat|entity:…)`
- 文章与图谱的关系写在元数据：
  - `sourceBeatIds`：取材/覆盖的源节点（写完可据此 `update_beat_status`）
  - `entityRefs`：文中涉及的实体 id
  - `beatRefs`：文中涉及的其他节点 id

### 工具怎么用

1. 摸结构：`get_project_outline` / `list_beats` / `list_entities` / `list_chapters`
2. 读详情：`read_beat` / `read_entity` / `read_chapter`
   - 读节点/实体时看 **outbound（出链）/ inbound（入链）/ suggestedReads**，顺藤摸瓜，勿编造未读设定
3. 写结构/设定：`create_beat` `update_beat` `create_entity` `update_entity`（content 里用双链互联）
4. 写正文：`write_chapter` / `update_chapter`（纯文本 + 元数据关联）
5. 推进节点：`update_beat_status`（文章产出后，源节点常 `outline→draft` 或 `draft→final`）
6. 技能：`list_skills` → `read_skill` → `read_skill_file`

### 硬约束

- **文章与节点分离**：成稿进 chapters，**不**把长正文回写进 `beat.content`
- 删除不可恢复，执行前确认用户意图
- 对话回复可用 Markdown；双链语法只出现在节点/实体 content


## Inputs To Read

- `get_project_outline`
- 定位/卖点类 `read_beat`；主角等 `read_entity`（姓名勿与书名设定冲突）
- 用户平台与禁区
- `references/title-blurb-formulas.md`

## Procedure

1. 从节点/实体提取：核心冲突、情绪收益、关键词（可引用双链上的名字，简介正文里写纯名）
2. 书名 5–10 候选（稳妥/打眼/平台向）
3. 短简介 100–200 字，前三句有钩；**简介是给商店看的纯文本，不含双链语法**
4. 标签主 3–5 + 长尾
5. 可选封面文案

## Write-Back

- `create_beat` / `update_beat`，标题如「作品定位 / 书名简介」
- content 可含：书名候选、选定简介、标签；用双链挂 `[@主角](entity:…)`
- **不要** `write_chapter` 把简介当成正文文章（除非用户要独立文案稿）
- 项目 `description` 若需改，说明让用户在项目设置保存，或仅在定位节点存一份

## Quality Gates

与已读实体名/设定不矛盾；前三句有钩；无违规词
