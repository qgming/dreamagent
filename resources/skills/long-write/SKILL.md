---
name: long-write
description: |
  长篇网文主路径（造梦师）：用节点建卷纲/章纲，用实体挂人物设定并双链互联，用文章写纯正文并元数据关联。
  Use when: 开长篇、写大纲、写正文、续写下一章、推进连载、黄金三章、卷纲章纲。
  触发方式：/long-write、/写长篇、「帮我开书」「写大纲」「续写下一章」
metadata:
  displayName: 长篇写作
  version: "3.1.0"
---

# long-write

把长篇从点子推到可连载。句面规则与抛光要点写在本技能流程里；长方法论在本包 `references/`。

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
  - `sourceBeatIds`：取材/覆盖的源节点（写完可据此 `edit({ path: "beats/{id}", status })`）
  - `entityRefs`：文中涉及的实体 id
  - `beatRefs`：文中涉及的其他节点 id
- 不熟双链时先 `read_skill`「dreamagent-guide」

### 工具怎么用

1. 摸结构：`list({ path: "outline" })` / `list({ path: "beats" })` / `list({ path: "entities" })` / `list({ path: "chapters" })`
2. 读详情：`read({ path: "beats/{id}" })` / `read({ path: "entities/{id}" })` / `read({ path: "chapters/{id}" })`
   - 读节点/实体时看 **outbound（出链）/ inbound（入链）/ suggestedReads**，顺藤摸瓜，勿编造未读设定
3. 写结构/设定：`write({ type: "beat", ... })` `write/edit path=beats/{id}` `write({ type: "entity", ... })` `write/edit path=entities/{id}`（content 里用双链互联）
4. 写正文：`write({ type: "chapter", ... })` / `write/edit path=chapters/{id}`（纯文本 + 元数据关联）
5. 推进节点：`edit({ path: "beats/{id}", status })`（文章产出后，源节点常 `outline→draft` 或 `draft→final`）
6. 技能：`list_skills` → `read_skill` → `read_skill_file`

### 硬约束

- **文章与节点分离**：成稿进 chapters，**不**把长正文回写进 `beat.content`
- 删除不可恢复，执行前确认用户意图
- 对话回复可用 Markdown；双链语法只出现在节点/实体 content


## Use When

开新长篇、写/改卷纲细纲、写或续一章、按反馈返修。

## Inputs To Read（按需）

1. `list({ path: "outline" })` — 节点全局与状态
2. 关键 `read({ path: "beats/{id}" })` / `read({ path: "entities/{id}" })` — 跟 **suggestedReads / outbound / inbound**
3. 续写：`list({ path: "chapters" })` + 最近 1–3 章 `read({ path: "chapters/{id}" })`（纯文本 + 其 sourceBeatIds/entityRefs）
4. 本包 `references/` 按需 `read_skill_file`（开篇/钩子/结构/对白/质检等）

## 对象怎么分工

| 内容 | 落点 | 双链 |
|------|------|------|
| 作品定位、hook、故事引擎、卷纲、章纲/任务卡 | **节点** | 链到相关实体/上下章节点 |
| 主角配角、势力、世界观条目、伏笔台账 | **实体** | 人物↔人物、人物↔节点 |
| 读者可见正文 | **文章** | 禁止；用 sourceBeatIds + entityRefs + beatRefs |

推荐节点状态流：`idea`（点子）→ `outline`（纲）→ 有文后 `draft` → 定稿对齐 `final`。
实体默认 `active`；退场可 `dormant`/`archived`。

## 总流程（路由）

只输出当前最需要的一层：

```text
前置规划(节点+实体) → 开篇/章纲(节点) → 单章文章 → 状态推进 → 审查
```

### 立项

1. 确认题材/平台/字数/基调（不明则问）。
2. **创建节点**（`write({ type: "beat", ... })`），content 里用双链挂实体，例如：
   - `[@林远](entity:ent_xxx)` 为主角
   - 章纲节点链到「卷一」节点
3. **创建实体**（`write({ type: "entity", ... })`），人设 content 可链回「出场节点」「所属势力实体」。
4. 结构节点 `edit({ path: "beats/{id}", status })` → `outline`。

故事引擎（可写在「作品定位」节点 content）：主角 → 欲望 → 阻碍 → 代价 → 为何现在 → 行动 → 后果 → 新问题。

### 章纲 / 任务卡（写文章前）

写在**节点** content（可含双链），建议字段：

```text
章节功能 / POV / 信息边界
出场：[@角色](entity:…) …
事件因果 / 场景节拍 / 章末钩 / 目标字数
```

### 逐章写文章

1. 读章纲节点 + 上章文章 + 出链实体（跟 suggestedReads）。
2. 默念四问：想做什么 / 谁挡 / 章末局面 / 为何翻下章。
3. `write({ type: "chapter", ... })`：
   - `title`、纯文本 `content`（**无双链**）
   - `sourceBeatIds: [本章纲节点 id, …]`
   - `entityRefs: [出场实体 ids]`（从读到的实体收集，勿瞎填）
   - `beatRefs: [相关结构节点]`
4. `edit(path=beats/{id}, status)(源节点, draft)`（若仍为 outline/idea）。
5. **句面自检（写时即做）**：
   - 视角统一；情绪用动作/物件；对白有身份差
   - 禁章末「他终于明白 / 他不知道的是…」升华预告体
   - 禁工作流句（「上一章讲了」「本章要写」）；正文无双链
6. **长线自检（交章前）**：因果前提、人设欲望、关系温度、伤势/已知信息、转场、章末钩是否与下一 beat 可接；疑点用证据表列出再改。

### 返修

- 结构/人设：先 `write/edit path=beats/{id}` / `write/edit path=entities/{id}`（可改双链）
- 正文：`write/edit path=chapters/{id}` 最小改，并同步元数据 refs；能换词不换句
- 禁止把整章正文粘回 beat.content

## Quality Gates

- [ ] 未编造未读实体/节点
- [ ] 文章无双链；节点/实体双链 id 真实存在
- [ ] sourceBeatIds / entityRefs 与正文出场一致
- [ ] 源节点状态已合理推进
- [ ] 章末有钩且非升华预告体
- [ ] 句面无高频空泛总结 / 说明书对白

## Outputs / Write-Back

- 结构 → beats（可双链）
- 设定 → entities（可双链）
- 正文 → chapters（纯文本 + 元数据）
