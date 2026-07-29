# -*- coding: utf-8 -*-
"""重写造梦师 7 个内置技能。

参考来源（思想吸收，非原文照搬）：
- stephenturner/skill-deslop、hardikpandya/stop-slop（去 AI 结构/套话/打分）
- Tomsawyerhu/Chinese-WebNovel-Skill（网文路由、章四问、anti_ai 分层）
- HZ-KMNO/web-novel-writing-guidance-skill（A/B/C 稿、人物信息边界、连续性）
- polaragent renwei-writing（打磨时保「人味/手迹」）
- 本仓库既有 banned-words / anti-ai-writing / long-write references
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "resources" / "skills"

# ---------------------------------------------------------------------------
# SKILL bodies
# ---------------------------------------------------------------------------

SKILLS: dict[str, str] = {}

SKILLS["deslop"] = """---
name: deslop
description: |
  网文/小说去 AI 味终稿技能。检测并清除 AI 写作痕迹（空泛总结、套话氛围、整齐三连、说明书对白、均匀节拍），用最小改动把文字改回「有人在现场」。
  Use when: 去AI味、终稿润色、太像模型、机翻感、deslop、humanize、这篇太AI了、不像人话。
  触发方式：/deslop、/去AI味、「去AI味」「去味」「deslop」「这篇太AI了」
metadata:
  displayName: 去AI味
  version: "2.0.0"
---

# deslop

终稿去 AI 味。**结构/因果问题**先修 beat/entity，不要用本技能硬磨剧情。

吸收了通用 deslop 的「删套话 / 破公式结构 / 打分」，以及中文网文 anti-ai 的「分层：空泛→声音→氛围→节奏」。

## Use When

- 用户明确：去 AI 味 / 不像人话 / 太模板 / deslop。
- 章节已有完整草稿，需要终稿抛光。
- 写完后自检发现：总结句多、人人一个腔、气氛词堆满。

## Inputs To Read

1. 待改全文：`read_chapter`（或用户粘贴）。
2. 风格与人设基线：相关 `read_entity` / `read_beat`。
3. 按需 `read_skill_file`：
   - `references/banned-words.md` — 中文网文高频 AI 词
   - `references/anti-ai-writing.md` — 指纹与三遍法详解
   - `references/structures.md` — 公式结构（三连/对比/碎句装深刻）
   - `references/rhythm-fingerprint.md` — 节奏指纹
   - `references/checklist.md` — 交稿前清单与打分

## 先分层，再动手

不要一上来全段润色。先判断主要故障层：

| 层 | 症状 | 先修什么 |
|----|------|----------|
| 1 空泛总结 | 「他很难过」「气氛微妙」「他终于明白」 | 动作化、物件化、刺激→反应 |
| 2 声音同质 | 人人会解释、工整礼貌、无身份差 | 身份/立场/压力方式差 |
| 3 套话氛围 | 空气凝固、时间静止、一丝/一抹堆叠 | 场内可感变化、小声音、距离 |
| 4 平均节奏 | 句长整齐、段段 4–6 句、无打断 | 长短交错、短句插刀、允许 1 句段 |

**底层未稳（因果断、人设崩、转场丢）→ 退回写/审技能，本技能只动句面。**

## Procedure — 三遍法（最小改动）

### Pass 1：检测（只列清单，不大改）

对照 references，列出：位置 + 类型 + 原句摘录。类型包括：

- 禁用词 / 宣传腔 / 章末升华体
- 公式结构：Not X. Y.、三连排比、自问自答、碎句装深刻
- 说明书对白、统一腔调
- 均匀节拍、段末金句癖

### Pass 2：最小替换

原则（兼吸收「人味儿」）：

1. **能换词不换句，能改句不改段。** 一段动三处是常态，动十处要警惕。
2. **保剧情与信息量**；专有名词、口头禅、用户手迹先当特征不是瑕疵。
3. **能用动作/对白，不用总结**；能写具体物，不写抽象情绪标签。
4. 用 `update_chapter` 写回（纯文本，无双链语法）。

### Pass 3：再检 + 报告

- 再跑 `references/checklist.md`。
- 五维打分（1–10，总分 &lt; 35/50 继续改）：直接 / 节奏 / 信任 / 像人 / 密度。
- 向用户交：**改动类型摘要 + 仍存风险**，禁止 silent 大改。

## 中文网文硬规则（本技能保留）

- 禁止章末「他终于明白 / 这一夜注定… / 他不知道的是更大风暴」式收束 → 用动作、对白、未完成压力收。
- 禁止为「去 AI」而切成残句、单字段、翻译腔、文言拼贴。
- 口语支架（了/也/还/就/吧/呢…）不是废话；人物争责/护人/找台阶时允许多半句。
- 正文禁止工作流语言（「上一章讲了」「本章要写」「读者会看到」）。

## Quality Gates

- [ ] 未删关键剧情与设定
- [ ] 未引入新套话
- [ ] 对话仍有人设差
- [ ] 朗读仍像现代中文网文，不是英文直译切碎
- [ ] 用户未授权时未做结构重写

## Outputs / Write-Back

- 润色正文 → `update_chapter`
- 问题清单与打分 → 对话回复（不写进章节）
"""

SKILLS["prose-craft"] = """---
name: prose-craft
description: |
  网文正文起草技法：视角、动作画面、刺激反应链、人话对白、节奏呼吸、信息有代价、章末钩。写正文/续写/扩写时用。
  Use when: 写正文、续写、扩写、改写某段、对话太假、视角乱、读着像AI草稿、怎么把这段写顺。
  触发方式：/prose-craft、/正文规则、「怎么写正文」「对话太假」「这段像AI」
metadata:
  displayName: 正文笔法
  version: "2.0.0"
---

# prose-craft

**写的时候**用的硬规则。本技能保证起草骨架像人写的；终稿可再扫禁用词与节奏。

## Use When

- `write_chapter` / `update_chapter` 起草或改写段落。
- 用户抱怨：像 AI 草稿、视角乱、对话假、节奏平、全是说明。

## Inputs To Read

- 当前目标：用户任务 + 对应 `read_beat`（章目标/细纲）。
- 人设与关系：`read_entity`。
- 上下文：`get_project_outline`、最近章 `read_chapter`。

## 每章四问（落笔前默念）

1. 这章主角**想做什么**？
2. **谁/什么**挡住他？
3. 章末**局面变成了什么**？
4. 读者**为什么还要翻下一章**？

答不全 → 先补 beat，再写正文。

## 场景最小结构

每场戏至少：**目标 → 阻碍 → 变化**。无变化的场景删、并、压。

## 九条起草硬规则

1. **视角锁死**
   一章（或明确切换前）一个主视角。禁止无铺垫越知（「他不知道的是…」留给审稿，不在正文预告）。

2. **动作与物件承载**
   少写情绪标签，多写可见动作、身体反应、可摸的物件。

3. **刺激 → 反应链**
   外部事件 → 即时反应 → 决策/行动。不要只有描写没有反应。

4. **对白像人话**
   短句、打断、潜台词、身份差。禁止轮流完美陈述设定。
   问：这话像现场这个人顺口说的，还是作者在念说明？

5. **信息边界**
   角色只说/只做其职业、关系、已知信息允许的事。警察先查流程，家属先护人，路人只给碎片。

6. **信息有代价**
   新设定用场景带出，禁止说明书插入。

7. **节奏有呼吸**
   长短句交错；冲突加速，余韵放慢。避免段段同长。

8. **标点服务呼吸**
   少用省略号/感叹号堆情绪；不要用碎句装深刻。

9. **收束有钩**
   章末落在变化、未完成压力、具体声音/物件上，不总结升华。

## 正文禁区（起草即禁）

- 工作流/元叙事：「上一章」「本章要写」「读者会看到」「此处埋伏笔」。
- 高频 AI 词：不禁、微微、深吸一口气、眼中闪过…能不用就不用。
- 把规则/系统提示写成字段清单塞进台词。

## Quality Gates

- [ ] 四问答得上
- [ ] 每场有变化
- [ ] 视角统一、信息边界成立
- [ ] 对白有身份差
- [ ] 章末有拉力且非升华体
- [ ] 纯文本无双链

## Outputs / Write-Back

- 正文：`write_chapter` / `update_chapter`（`sourceBeatIds` / `entityRefs` / `beatRefs`）
- 结构微调：`update_beat`；状态：`update_beat_status` → draft
"""

SKILLS["long-write"] = """---
name: long-write
description: |
  长篇网文主路径：立项、卖点/故事引擎、卷纲章纲、开篇、逐章正文、续写与返修。绑定造梦师节点/实体/章节工具。
  Use when: 开长篇、写大纲、写正文、续写下一章、推进连载、黄金三章、卷纲章纲。
  触发方式：/long-write、/写长篇、「帮我开书」「写大纲」「续写下一章」
metadata:
  displayName: 长篇写作
  version: "2.0.0"
---

# long-write

把长篇从点子推到可连载。技法长文在本包 `references/` 按需 `read_skill_file`；句面与长线自检写在本技能流程中。

设计吸收中文网文 skill 的「先判断层再写」与「每章四问 + 章纲」，但落点是造梦师：**beats / entities / chapters**。

## Use When

- 开新长篇、写/改卷纲细纲、写或续一章、按反馈返修。

## Inputs To Read（按需，勿一次灌满）

1. `get_project_outline`
2. 相关 `read_beat` / `read_entity`
3. 续写：最近 1–3 章 `read_chapter`
4. 本包 `references/`：opening / hook / structure / dialogue / anti-ai / quality-checklist 等

## 总流程（路由）

先判断任务落在哪一层，**只输出当前最需要的一层**：

```text
前置规划 → 开篇/卷纲章纲 → 单章执行 → 完稿审查
```

| 层 | 典型问题 | 做法 |
|----|----------|------|
| 前置 | 值不值得写、卖点、引擎、篇幅 | 压 hook / premise / 故事引擎 → beats + 关键 entities |
| 开篇 | 抓手慢、黄金三章疲 | 前 300–500 字抓手；前三章给主角/冲突/卖点/追读理由 |
| 结构 | 中段散、无章纲 | **长篇默认要章纲**（beats）；无章纲易支线乱、章末软 |
| 单章 | 写正文/续写 | 章任务卡 → `write_chapter` |
| 返修 | 用户反馈 | 先分「必须/偏好/可选」；逻辑人设问题先改 beat 再改正文 |
| 收口 | 交章前 | 连续性质检；句面自检 |

## 立项

1. 与用户确认：题材、平台、目标字数、情绪基调（不明则问，不编）。
2. Beats：作品定位、一句话 hook、故事引擎、卷纲、前 3–5 章细纲。
3. Entities：主角、关键配角、势力、必要世界观（够用即可，禁止设定膨胀开书）。
4. `update_beat_status` → `outline`。

**故事引擎最小式：** 主角 → 欲望 → 阻碍 → 失败代价 → 为何现在 → 行动 → 后果 → 新问题。

## 章纲 / 任务卡（写正文前）

重要章或用户在意逻辑时，先有（可写在 beat 正文）：

```text
章节功能 / POV与信息边界 / 人物此刻目标
事件因果链 / 场景节拍 / 章末钩 / 字数目标
```

每人出场：想要什么、知道/不知道/误以为、不会说什么。

## 逐章执行

1. 读 outline + 上章 + 相关实体。
2. 答「四问」，锁定任务卡。
3. 起草：`write_chapter` 纯文本 + 关联元数据；视角/动作/对白按本技能规则。
4. 源节点 `update_beat_status` → `draft`。
5. 自检：目标是否完成、冲突在否、信息边界、新设定/伏笔、下一章可接。
6. 句面终检与长线自检按本技能 Quality Gates。

## 返修

- 内容/逻辑/人设：先 `update_beat`，再 `update_chapter` 最小改。
- 仅文风：最小改句面，不擅自改剧情。

## Quality Gates

- [ ] 未编造未读设定
- [ ] 有引擎与章目标，章末有钩
- [ ] 正文无双链、无元叙事
- [ ] 关联元数据已填
- [ ] 连续性无明显硬伤

## Outputs / Write-Back

- 结构 → beats；设定 → entities；正文 → chapters
- 禁止把长方法论贴进章节正文

## Reference Map

开篇/钩子/结构/对白/反转/类型/质检等见 `references/` 文件名；按场景 `read_skill_file`。
"""

SKILLS["short-write"] = """---
name: short-write
description: |
  短篇网文主路径：卖点、4–6 段蓝图、最少人物、整篇/分段成稿与返修。适合盐言/番茄短篇等强情绪强反转取向。
  Use when: 写短篇、盐言、番茄短篇、短篇构思、设计反转、一篇完结。
  触发方式：/short-write、/写短篇、「写个短篇」「盐言故事」
metadata:
  displayName: 短篇写作
  version: "2.0.0"
---

# short-write

一次可投稿短篇（约 1–3 万字可分段交付）。笔法、终检与门面要点写在本技能流程中。

## Use When

- 短篇立项、蓝图、成稿、返修、反转设计。

## Inputs To Read

- `get_project_outline`、相关 beat/entity、已有 chapters。
- 平台与读者情绪（甜/虐/爽/智）。
- 按需本包 `references/`（opening、reversal、female-audience、hooks 等）。

## Procedure

1. **卖点**：一句话冲突 + 情绪收益 + 反转承诺 → `create_beat` 定位。
2. **蓝图（4–6 段）**：开篇钩 → 推进 → 转折 → 高潮 → 收束（可多 beat）。
   短篇更要早冲突；反转要公平（前文有线索），禁止纯骗读者。
3. **人物**：最少必要角色 → entities；每人有独立小欲望。
4. **起草**：按段或整篇 `write_chapter`；禁止注水日常。
5. **返修**：`update_chapter` 最小改；结构问题先改 beat。
6. **包装与句面终检**：本技能内完成书名简介与最小改动抛光。

## 短篇四问（改自长篇）

1. 开篇几秒内读者卡在什么问题上？
2. 中段压力如何升级？
3. 反转改写了读者哪个假设？
4. 收束是否兑现承诺且留余味（非说教）？

## Quality Gates

- [ ] 开篇极早进冲突
- [ ] 反转有铺垫
- [ ] 不注水
- [ ] 正文纯文本无双链

## Outputs / Write-Back

- beats / entities / chapters
"""

SKILLS["continuity-audit"] = """---
name: continuity-audit
description: |
  长篇连续性体检：设定冲突、伏笔、人设、时间线、能力越级、信息边界。输出带证据的问题表与最小修法；默认不擅自大改正文。
  Use when: 查连续性、查伏笔、人设崩没、前后矛盾、写新章前核对 canon、连载体检。
  触发方式：/continuity-audit、/连续性检查、/查伏笔、「前后对得上吗」「人设崩了没」
metadata:
  displayName: 连续性审稿
  version: "2.0.0"
---

# continuity-audit

诊断优先。用户明确「帮我改」后再动 `update_*`。

吸收网文 skill 的「六种一致性」检查，映射到 beats/entities/chapters。

## Use When

- 新章前核对；阶段性回顾；读者/用户反馈前后矛盾。

## Inputs To Read

1. `get_project_outline` + 范围内 `read_beat`
2. `list_entities` → 相关 `read_entity`
3. `list_chapters` → 指定或最近 N 章 `read_chapter`
4. 按需 `references/continuity-checklist.md`

## Procedure

1. **定范围**：全书 / 卷 / 章列表 / 单线（某角色、某伏笔）。
2. **建对照**（可在回复中制表，不必落盘）：
   人物状态、能力边界、时间线、已知信息、伏笔（埋/收）、地理势力、物件归属。
3. **六维审计**（任 2 项不稳 → 不建议直接交章）：
   1. 剧情因果：事件前提、触发、后果
   2. 人物目标：本章欲望有无无故漂移
   3. 情绪与关系：温度是否接上一场
   4. 身体与信息：伤势/秘密/误会/已知是否丢
   5. 场景与转场：读者会否迷路
   6. 章末承接：是否收在变化上、下章能否接
4. 另查：设定互相打架、战力/资源越级、伏笔失收或提前剧透。
5. **输出表**：

```text
| 问题 | 证据(章/节点/实体) | 影响 | 严重度 | 最小修法 |
```

6. **授权后写回**：`update_chapter` / `update_entity` / `update_beat`；或 `create_beat` 存「连续性报告」。

## Quality Gates

- [ ] 每条有证据位置
- [ ] 区分硬伤 vs 风格偏好
- [ ] 未授权不大改正文
- [ ] 修法不引入新矛盾

## Outputs / Write-Back

- 默认：对话报告
- 可选：报告 beat；台账实体/节点更新
"""

SKILLS["title-blurb"] = """---
name: title-blurb
description: |
  书名、简介、标签、封面文案：把卖点收成可点击的门面，服务平台过审与点击。
  Use when: 起书名、写简介、取标签、封面文案、优化点击、上架包装。
  触发方式：/title-blurb、/起名、/简介、「起个书名」「写简介」
metadata:
  displayName: 起名简介
  version: "2.0.0"
---

# title-blurb

门面包装，不负责写正文。

## Inputs To Read

- `get_project_outline`；定位类 `read_beat` / `read_entity`
- 用户：题材、卖点、平台、情绪、禁区
- 按需 `references/title-blurb-formulas.md`

## Procedure

1. **锁卖点**：一句话核心冲突 + 情绪收益（爽/甜/虐/智…）。
2. **书名**：5–10 候选，分「稳妥 / 打眼 / 平台向」；各注钩子；禁剧透结局与违规词。
3. **简介**：短 100–200 字为主；**前三句必须有冲突或悬念**；不剧透结局。
4. **标签**：主 3–5 + 长尾；避空泛与违规。
5. **封面文案**（可选）：主标题 + 副句，服务点击。

## Quality Gates

- [ ] 名/简介与已读设定不矛盾
- [ ] 前三句有钩
- [ ] 平台差异已说明（若指定）

## Outputs / Write-Back

- `create_beat` / `update_beat`「作品定位」
- 回复给可复制候选表
"""

SKILLS["skill-creator"] = """---
name: skill-creator
description: |
  把反复使用的写作流程/检查清单/风格固化成造梦师可导入的 SKILL.md 技能包（含可选 references），并说明 ZIP 安装方式。
  Use when: 做成技能、固化套路、新建/改进技能、优化触发描述、把流程存下来。
  触发方式：/skill-creator、「做个技能」「把这套存成技能」
metadata:
  displayName: 技能制作
  version: "2.0.0"
---

# skill-creator

产出符合 Agent Skills 标准、能被造梦师加载的技能目录。

## Use When

- 新建或改进本地技能；固化写作流程/风格；优化 description 触发。

## Inputs To Read

- 用户场景、输入输出、失败案例。
- 改进已有：`list_skills` / `read_skill` / `read_skill_file`。
- `references/skill-template.md`、`references/description-writing.md`。

## Procedure

### 1. 澄清（缺则问）

1. 何时触发（一句话 + 口语词）
2. 硬规则（短）
3. 产出形态（beat / entity / chapter / 报告）

### 2. 目录与 frontmatter

```text
<skill-id>/
  SKILL.md
  references/*.md   # 可选
```

必填：`name`（kebab-case=目录名）、`description`（含 Use when/触发词）、可选 `metadata.displayName`。

### 3. 正文骨架

Use When → Inputs To Read → Procedure → Quality Gates →（可选）Reference Map。

硬规则：

- 短而硬；长文进 references，靠 `read_skill_file`。
- 工具名仅限造梦师真实工具（含 list/read_skill* 与图谱工具）。
- 写回优先 beats / entities / chapters。

### 4. 安装

1. 建目录 → 2. 打 **单技能根** ZIP（仅一个 SKILL.md）→ 3. 技能页「导入 ZIP」→ 4. 启用后 `list_skills` 可见。

向用户交付：建议 id、displayName、完整 SKILL.md 草稿、目录树。

## Quality Gates

- [ ] name 合法且=目录名
- [ ] description 可被模型发现
- [ ] 无虚构工具
- [ ] 与现有技能触发不严重撞车

## Reference Map

| 场景 | 路径 |
|------|------|
| description | references/description-writing.md |
| 模板 | references/skill-template.md |
"""


# ---------------------------------------------------------------------------
# Extra references for deslop
# ---------------------------------------------------------------------------

STRUCTURES_MD = """# 公式结构黑名单（网文向）

吸收通用 deslop/stop-slop 的结构诊断，改写为中文网文常见形态。

## 1. 机械对比 / 伪反转

| 模式 | 问题 | 改法 |
|------|------|------|
| 不是因为 X。是因为 Y。 | 电报式反转 | 直接写 Y |
| 问题不在 X，在于 Y | 公式重框 | 直接陈述 Y |
| 不是 X，而是 Y（高频） | AI 默认句 | 删「不是」半句 |
| 与其说…不如说… | 演讲腔 | 选一边说清 |

## 2. 否定清单再揭晓

「不是勇气。不是命运。是选择。」→ 直接写是什么。
网文里偶用于角色嘴炮可以，**叙述层**少用。

## 3. 碎句装深刻

「速度。而已。这就是差距。」
「他懂了。彻底懂了。」

→ 写成完整、有现场的句子；强调靠情节不靠碎片。

## 4. 自问自答

「结果呢？毁灭性的。」
「最糟的是什么？没人发现。」

→ 并成陈述，或改成角色对白里的真疑问（真的有人在问）。

## 5. 三连排比

「他愤怒，他不甘，他绝望。」
「更快、更强、更冷酷。」

→ 拆成参差 1–2 个具体反应；细节 > 排比。

## 6. 章末预告体 / 升华体

「他不知道的是，更大的风暴即将到来。」
「这一夜，注定载入史册。」
「他终于明白了人生的意义。」

→ 动作、对白、未完成的具体压力收束。

## 7. 说明书对白

每人轮流把设定说完整、语法完美、无打断。

→ 打断、答非所问、隐瞒、职业切口、信息差。

## 8. 平均节奏

连续三句长度几乎一样；每段 4–6 句钟摆。

→ 打断一句；允许 1 句成段；冲突处加密，余韵处放空。
"""

CHECKLIST_MD = """# 去 AI 味交稿清单与打分

## 交稿前快速勾选

- [ ] 一级禁用词（banned-words）无明显残留
- [ ] 无「他终于明白 / 他不知道的是」章末体
- [ ] 无大段说明对白
- [ ] 主要角色说话能听出差别
- [ ] 情绪多靠动作/物件，少靠标签
- [ ] 句长有变化，无整页碎句装深刻
- [ ] 无工作流/元叙事句子
- [ ] 朗读像现代中文，不像翻译腔切碎

## 五维打分（1–10）

| 维度 | 问题 |
|------|------|
| 直接 | 在陈述还是在宣布/总结？ |
| 节奏 | 有呼吸还是节拍器？ |
| 信任 | 是否把读者当傻子解释？ |
| 像人 | 能否感到具体立场与代价？ |
| 密度 | 是否有可删的空句？ |

**总分 &lt; 35/50 → 再改一轮。**

## 最小改动纪律

- 先假设口语毛边是手迹
- 说不出「这里具体绊倒读者」的改动 → 不做
- 改完用一句话告诉用户你动了哪类问题
"""


def write_skill(name: str, body: str) -> None:
    path = ROOT / name / "SKILL.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body.lstrip("\n"), encoding="utf-8")
    print(f"SKILL  {name}")


def main() -> None:
    for name, body in SKILLS.items():
        write_skill(name, body)

    deslop_ref = ROOT / "deslop" / "references"
    deslop_ref.mkdir(parents=True, exist_ok=True)
    (deslop_ref / "structures.md").write_text(STRUCTURES_MD.lstrip("\n"), encoding="utf-8")
    (deslop_ref / "checklist.md").write_text(CHECKLIST_MD.lstrip("\n"), encoding="utf-8")
    print("refs  deslop/structures.md, checklist.md")
    print("done", len(SKILLS))


if __name__ == "__main__":
    main()
