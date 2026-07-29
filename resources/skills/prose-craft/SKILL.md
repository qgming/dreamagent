---
name: prose-craft
description: |
  正文起草技法（造梦师）：写文章时用；节点/实体里写提纲时可引用人物双链。管视角、动作、对白、信息边界、章末钩。
  Use when: 写正文、续写、扩写、对话假、视角乱、像AI草稿。
  触发方式：/prose-craft、/正文规则、「怎么写正文」「对话太假」
metadata:
  displayName: 正文笔法
  version: "3.0.0"
---

# prose-craft

**写文章 content 时**的硬规则。终稿大抛光可再扫一遍下方「禁用词速查」。

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

- 章纲：`read_beat`（看双链出场表）
- 人设：`read_entity`（出链关系）
- 上下文：`get_project_outline`、近文 `read_chapter`

## 落笔前

1. 从节点双链收集本章 **entityRefs / beatRefs** 候选，写文章时写入元数据（正文只写名字，不写双链语法）。
2. 四问：想做什么 / 谁挡 / 章末局面 / 为何翻下章。
3. 每场：**目标 → 阻碍 → 变化**。

## 九条（文章正文）

1. 视角锁死（一章一主视角；越知不写进文章预告句）
2. 动作与物件承载情绪
3. 刺激→反应链
4. 对白有身份差（对照实体人设）
5. **信息边界**：只写该实体「当前应知道」的；不知道的别写全知解释
6. 信息有代价（设定经场景，不经说明书对白）
7. 节奏有呼吸
8. 标点服务呼吸，碎句不装深刻
9. 章末钩落在变化/物件/对白，不升华、不「他不知道的是」

## 双链相关纪律

| 位置 | 做法 |
|------|------|
| 文章 content | 只写「林远转身」这类纯文本，**永不** `[@林远](entity:…)` |
| 节点 content | 任务卡里用双链列出场：`出场：[@林远](entity:…)` |
| 实体 content | 关系网用双链：`上司 [@沈姐](entity:…)`、`主线 [@第12章纲](beat:…)` |
| 写完文章 | `entityRefs`/`sourceBeatIds` 与真实出场、源纲对齐 |

## 正文禁区

- 元叙事/工作流句（上一章讲了、本章要写、读者会看到）
- 双链语法、字段清单式系统提示腔

## 禁用词速查（起草时少写，写完再扫一遍）

**一级（见即换）**：仿佛/一丝/一抹、深吸一口气、缓缓、不禁、微微、眼中闪过、嘴角勾起、心中一动、不容置疑、显而易见。

**二级（高频则砍）**：「他终于明白…」「这一刻…」「他知道…」总结升华；连续三句同构排比；「带着一丝…」「像刀子一样…」万能状语。

**替换**：抽象情绪→动作（紧张→手在抖）；「感到愤怒」→攥紧拳头；说明书对白→打断/隐瞒/身份切口。

## Outputs / Write-Back

- `write_chapter` / `update_chapter` + 元数据
- 提纲修正：`update_beat`（可双链）
- `update_beat_status` → draft
