---
name: short-write
description: |
  短篇主路径（造梦师）：节点承载蓝图与反转点，实体承载最少角色（双链），文章承载纯正文与元数据关联。
  Use when: 写短篇、盐言、番茄短篇、短篇构思、设计反转、一篇完结。
  触发方式：/short-write、/写短篇、「写个短篇」「盐言故事」
metadata:
  displayName: 短篇写作
  version: "3.0.0"
---

# short-write

短篇可投稿成稿。笔法、抛光与书名简介要点直接写在本技能流程中。

## 造梦师领域模型（必须遵守）

项目由三类对象 + 双链图构成：

| 对象 | 存什么 | 状态 | 正文双链 |
|------|--------|------|----------|
| **节点 Beat** | 节拍/大纲/任务/定位等结构单元 | `idea → outline → draft → final` | **允许** |
| **实体 Entity** | 人物、势力、设定、物件、风格基因等 | `active / dormant / archived` | **允许** |
| **文章 Chapter** | 面向读者的成稿正文 | `draft / final` | **禁止** |

### 双链

- 语法：`[@显示名](entity:实体id)` 或 `[@显示名](beat:节点id)`（**必须是工具返回的真实 id**）
- **禁止** `@名字` / `[[名字]]` / 用名字当 id——这些不会建边
- 流程：先 `create_*` 拿 `data.id`，再 `update_*` 把双链写进 content
- **只写在节点/实体的 content 里**；系统会维护 `entityRefs` / `beatRefs`
- **文章 content 必须是纯文本**，禁止任何 `[@…](beat|entity:…)`
- 文章与图谱的关系写在元数据：
  - `sourceBeatIds`：取材/覆盖的源节点（写完可据此 `update_beat_status`）
  - `entityRefs`：文中涉及的实体 id
  - `beatRefs`：文中涉及的其他节点 id
- 不熟双链时先 `read_skill`「dreamagent-guide」

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


## Procedure

1. **卖点节点** `create_beat`（定位/承诺）；可双链预告核心实体。
2. **蓝图 4–6 段** → 多个 beat 或一个 beat 多节；段与段用 `[@…](beat:)` 互链。
3. **最少角色** → entities，content 双链到蓝图节点。
4. **成稿** `write_chapter`（可一章或多章文章）：
   - 纯文本；`sourceBeatIds` 指向蓝图段；`entityRefs` 列出场角色。
   - 写时：视角锁、动作承载、对白有身份差、章末有钩不升华。
5. 蓝图节点 status → `draft`/`final`；文章 → `final`（用户认可后）。
6. **门面（本技能内完成）**：
   - 书名 5–10 候选（题材+爽点一眼可识别）；短简介 100–200 字，**前三句有钩**，纯文本无双链
   - 写回定位节点 content（可双链主角），不要把简介当成长正文文章除非用户要
7. **句面终检**：删空泛总结、说明书对白、章末预告体；最小改动 `update_chapter`。

## 短篇四问

开篇卡什么问题？中段如何加压？反转改了哪个假设（前文节点/实体须有线索）？收束是否兑现且不说教？

## Quality Gates

- [ ] 早冲突、反转有铺垫（能在 beat/entity 找到线索）
- [ ] 文章无双链；元数据 refs 完整
- [ ] 不注水
- [ ] 有可用书名/简介候选（若用户要上架包装）

## Outputs / Write-Back

beats（蓝图/定位）/ entities（人）/ chapters（文）
