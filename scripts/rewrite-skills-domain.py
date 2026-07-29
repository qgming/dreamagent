# -*- coding: utf-8 -*-
"""按造梦师领域模型重写 7 个内置技能。

领域事实（与 src/shared 一致）：
- 节点 Beat：idea|outline|draft|final；content 可含双链
- 实体 Entity：active|dormant|archived；content 可含双链
- 文章 Chapter：draft|final；content 纯文本禁止双链；关联靠元数据
- 双链语法：[@显示名](entity:id) / [@显示名](beat:id)
- 文章关联：sourceBeatIds / entityRefs / beatRefs（元数据，非正文）
- 读节点/实体会返回 outbound / inbound / suggestedReads
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "resources" / "skills"

# 所有技能共用的领域块（短，避免重复超长）
DOMAIN = """
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
"""

SKILLS: dict[str, str] = {}

SKILLS["long-write"] = f"""---
name: long-write
description: |
  长篇网文主路径（造梦师）：用节点建卷纲/章纲，用实体挂人物设定并双链互联，用文章写纯正文并元数据关联。
  Use when: 开长篇、写大纲、写正文、续写下一章、推进连载、黄金三章、卷纲章纲。
  触发方式：/long-write、/写长篇、「帮我开书」「写大纲」「续写下一章」
metadata:
  displayName: 长篇写作
  version: "3.0.0"
---

# long-write

把长篇从点子推到可连载。句面规则与抛光要点写在本技能流程里；长方法论在本包 `references/`。
{DOMAIN}

## Use When

开新长篇、写/改卷纲细纲、写或续一章、按反馈返修。

## Inputs To Read（按需）

1. `get_project_outline` — 节点全局与状态
2. 关键 `read_beat` / `read_entity` — 跟 **suggestedReads / outbound / inbound**
3. 续写：`list_chapters` + 最近 1–3 章 `read_chapter`（纯文本 + 其 sourceBeatIds/entityRefs）
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
2. **创建节点**（`create_beat`），content 里用双链挂实体，例如：
   - `[@林远](entity:ent_xxx)` 为主角
   - 章纲节点链到「卷一」节点
3. **创建实体**（`create_entity`），人设 content 可链回「出场节点」「所属势力实体」。
4. 结构节点 `update_beat_status` → `outline`。

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
3. `write_chapter`：
   - `title`、纯文本 `content`（**无双链**）
   - `sourceBeatIds: [本章纲节点 id, …]`
   - `entityRefs: [出场实体 ids]`（从读到的实体收集，勿瞎填）
   - `beatRefs: [相关结构节点]`
4. `update_beat_status(源节点, draft)`（若仍为 outline/idea）。
5. **句面自检（写时即做）**：
   - 视角统一；情绪用动作/物件；对白有身份差
   - 禁章末「他终于明白 / 他不知道的是…」升华预告体
   - 禁工作流句（「上一章讲了」「本章要写」）；正文无双链
6. **长线自检（交章前）**：因果前提、人设欲望、关系温度、伤势/已知信息、转场、章末钩是否与下一 beat 可接；疑点用证据表列出再改。

### 返修

- 结构/人设：先 `update_beat` / `update_entity`（可改双链）
- 正文：`update_chapter` 最小改，并同步元数据 refs
- 禁止把整章正文粘回 beat.content

## Quality Gates

- [ ] 未编造未读实体/节点
- [ ] 文章无双链；节点/实体双链 id 真实存在
- [ ] sourceBeatIds / entityRefs 与正文出场一致
- [ ] 源节点状态已合理推进
- [ ] 章末有钩且非升华预告体

## Outputs / Write-Back

- 结构 → beats（可双链）
- 设定 → entities（可双链）
- 正文 → chapters（纯文本 + 元数据）
"""

SKILLS["short-write"] = f"""---
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
{DOMAIN}

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

## Outputs / Write-Back

beats（蓝图）/ entities（人）/ chapters（文）
"""

SKILLS["prose-craft"] = f"""---
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
{DOMAIN}

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
"""

SKILLS["deslop"] = f"""---
name: deslop
description: |
  文章去 AI 味（造梦师）：只改 Chapter 纯文本；不碰节点/实体双链结构。分层检测空泛/声音/氛围/节奏，最小改动写回。
  Use when: 去AI味、终稿润色、太像模型、deslop、不像人话、这篇太AI了。
  触发方式：/deslop、/去AI味、「去AI味」「deslop」「这篇太AI了」
metadata:
  displayName: 去AI味
  version: "3.0.0"
---

# deslop

终稿抛光 **文章**。结构/人设/因果问题先 `update_beat` / `update_entity` 再动句面，不要用本技能硬磨剧情。
{DOMAIN}

## 作用边界

| 做 | 不做 |
|----|------|
| `read_chapter` → 改 content → `update_chapter` | 把双链写进文章 |
| 对照实体人设保持声线 | 擅自改剧情结构（除非用户要） |
| 保持 `entityRefs` 等元数据合理 | 把长文回写到 beat.content |
| 最小改动保用户手迹 | silent 大段重写不说明 |

## Inputs To Read

1. `read_chapter`
2. 元数据里的实体：`read_entity`（声线/口头禅）
3. 可选源纲 `read_beat`
4. `read_skill_file`：`references/banned-words.md`、`anti-ai-writing.md`、`structures.md`、`rhythm-fingerprint.md`、`checklist.md`

## 分层再动手

| 层 | 症状 | 修 |
|----|------|-----|
| 1 空泛 | 总结句、情绪标签 | 动作/物件/反应 |
| 2 声音 | 人人一口 | 按实体差拉开 |
| 3 氛围套话 | 空气凝固… | 场内可感变化 |
| 4 节奏 | 句长齐、段齐 | 长短交错 |

因果断/人设崩 → 停，先改 beat/entity 或重写任务卡，再回来抛光。

## 三遍法

1. **检测**只列表（位置+类型+摘录）
2. **最小替换** `update_chapter`；能换词不换句；口头禅当手迹
3. **再检** checklist + 五维打分（&lt;35/50 再改）；向用户报告改动类型

## 中文硬规则

- 禁章末升华/预告体
- 禁为去 AI 切成残句/翻译腔
- 口语支架可留
- 禁工作流元叙事

## Outputs / Write-Back

- 仅 `update_chapter`（content 纯文本）
- 若发现 refs 与出场不符，可顺手修正 chapter 的 entityRefs/beatRefs 元数据
- 清单与打分只在对话
"""

SKILLS["continuity-audit"] = f"""---
name: continuity-audit
description: |
  连续性体检（造梦师）：沿节点/实体双链与文章元数据查因果、人设、伏笔、时间线、信息边界；输出证据表。
  Use when: 查连续性、查伏笔、人设崩、前后矛盾、写新章前对 canon。
  触发方式：/continuity-audit、/连续性检查、「前后对得上吗」
metadata:
  displayName: 连续性审稿
  version: "3.0.0"
---

# continuity-audit

默认只诊断。用户明确授权再 `update_*`。
{DOMAIN}

## 图怎么查

1. `get_project_outline` 定范围节点
2. `read_beat` / `read_entity` 吃 **outbound + inbound + suggestedReads**（双链即证据网络）
3. `list_chapters` + `read_chapter`，核对其 `sourceBeatIds` / `entityRefs` / `beatRefs` 是否与正文一致
4. 伏笔：优先找名为台账的实体/节点，或内容含「伏笔/回收」的对象

## 六维（任 2 不稳不建议交章）

1. 剧情因果（事件前提/触发/后果 — 对 beat 任务卡与文章）
2. 人物目标（实体欲望 vs 文章行为）
3. 情绪与关系（实体关系双链 vs 文中温度）
4. 身体与信息（伤势/秘密/已知 — 实体 content 与文章是否丢）
5. 场景转场（章序、beat 链）
6. 章末承接（文章钩 vs 下一 beat）

另查：设定互斥、战力越级、伏笔失收、**文章误含双链**、**refs 与出场不符**、**节点 status 与是否已有文章脱节**。

## 输出表

```text
| 问题 | 证据(beat/entity/chapter id) | 影响 | 严重度 | 最小修法 |
```

## 授权后写回

| 问题类型 | 工具 |
|----------|------|
| 纲/任务卡错 | `update_beat`（可调双链） |
| 人设/设定错 | `update_entity` |
| 正文不一致 | `update_chapter`（纯文本+元数据） |
| 存报告 | `create_beat`「连续性报告」并双链到相关对象 |
| 节点已完稿 | `update_beat_status` → final |

## Quality Gates

- 每条有 id 级证据；区分硬伤/偏好；修法不引入新矛盾
"""

SKILLS["title-blurb"] = f"""---
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
{DOMAIN}

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
"""

SKILLS["skill-creator"] = f"""---
name: skill-creator
description: |
  制作可导入造梦师的 SKILL.md 包：流程必须绑定节点/实体/文章与双链规则，禁止虚构工具。
  Use when: 做成技能、固化套路、新建改进技能、优化触发。
  触发方式：/skill-creator、「做个技能」「把这套存成技能」
metadata:
  displayName: 技能制作
  version: "3.0.0"
---

# skill-creator

产出 Agent Skills 标准目录，装进造梦师后可用。
{DOMAIN}

## Procedure

### 1. 澄清

触发场景、硬规则、产出落在 **beat / entity / chapter** 哪类。

### 2. 目录

```text
<kebab-id>/
  SKILL.md
  references/*.md   # 可选
```

frontmatter：`name`、`description`（Use when + 触发词）、`metadata.displayName`。

### 3. 正文必须写清的领域约定

每个新技能的 Procedure / Outputs 应显式包含：

- 读哪些：outline / beat / entity / chapter / 是否跟 suggestedReads
- 写哪些：create/update 哪种对象
- **双链**：节点实体 content 可用；文章禁止；文章用 sourceBeatIds/entityRefs/beatRefs
- 状态：是否 `update_beat_status` / chapter final
- **自洽**：流程写全；需要的规则直接写进 SKILL 或本包 `references/`

禁止：`workspace_*`、`skill_manage`、不存在的 FS 工具；通用 `read_file` 读技能目录（应用 `read_skill_file`）。

### 4. 安装

单根 ZIP（一个 SKILL.md）→ 技能页导入 → 启用 → `list_skills` 可见。

## Quality Gates

- name=目录名；description 可发现
- 工具名真实；双链规则写明
- description 触发面清晰，避免与常见写作任务描述完全撞车

## Reference Map

`references/skill-template.md`、`references/description-writing.md`
"""


def main() -> None:
    for name, body in SKILLS.items():
        path = ROOT / name / "SKILL.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body.lstrip("\n"), encoding="utf-8")
        print("wrote", name, "lines", body.count("\n") + 1)
    print("done", len(SKILLS))


if __name__ == "__main__":
    main()
