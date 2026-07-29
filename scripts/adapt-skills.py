# -*- coding: utf-8 -*-
"""将内置 SKILL.md 适配为造梦师工具约定。"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "resources" / "skills"

SKILLS: dict[str, str] = {}

SKILLS["skill-creator"] = """---
name: skill-creator
description: |
  创建与改进本地技能的方法论手册。把反复用到的写作套路、流程、检查清单或风格，沉淀成结构规范、触发精准的可复用 skill。
  Use when: 用户要新建技能 / 改进现有技能 / 把一套写法或流程固化下来 / 说「做成一个技能」「把这套套路存下来」「记住这个流程」。
  触发方式：/skill-creator、「做个技能」「把这套套路存成技能」「优化这个技能的触发」
metadata:
  displayName: 技能制作
---

# skill-creator

把用户反复用到的写作套路，沉淀成可被造梦师加载的本地技能（`SKILL.md` + 可选 `references/`）。

## Use When

- 用户要把一套流程/检查清单/风格固化成技能。
- 用户要改进已有技能的触发描述或结构。
- 需要把某套文风或流程固化成可复用技能时。

## Inputs To Read

- 用户描述的任务场景、典型输入输出、失败案例。
- 若改进已有技能：先 `list_skills` / `read_skill` 读现有全文与 references。
- 模板：本技能 `references/skill-template.md`、`references/description-writing.md`。

## Procedure

### 1. 澄清意图

下手前先答清三件事，缺信息直接问用户（不要凭空编）：

1. **触发场景**：什么时候该用？用一句话 + 若干口语触发词。
2. **硬规则**：必须遵守的短约束（不要长方法论）。
3. **产出形态**：最终交付什么（节点、实体、章节、报告文案等）。

### 2. 设计目录与 frontmatter

标准结构：

```text
<skill-id>/
  SKILL.md
  references/*.md   # 可选，长方法论按需加载
```

frontmatter 必填：`name`（kebab-case=目录名）、`description`（含 Use when / 触发词）、可选 `metadata.displayName`。

### 3. 写 SKILL.md 正文

四件套：Use When / Inputs To Read / Procedure / Quality Gates。
硬规则：短而硬；工具名必须是造梦师真实工具；写回目标优先 beats / entities / chapters。

### 4. 交付与安装

1. 建好目录与 SKILL.md（+ references）。
2. 打成单个技能根目录的 ZIP（恰好一个 SKILL.md）。
3. 侧边栏「技能」页 → 导入 ZIP → 启用。
4. 新对话中 `list_skills` 应可见。

## Quality Gates

- [ ] name kebab-case 且与目录一致
- [ ] description 含 Use when / 触发词
- [ ] 不依赖未声明工具
- [ ] 长文在 references，按需 read_skill_file

## Reference Map

| 场景 | 相对路径 |
|------|----------|
| 写 description | references/description-writing.md |
| 套骨架 | references/skill-template.md |
"""

SKILLS["prose-craft"] = """---
name: prose-craft
description: |
  网文正文的写作技法手册。锁定视角、用动作承载画面、对话像人话、节奏有呼吸、标点干净、保留人设味。
  Use when: 写正文 / 续写 / 扩写 / 改写某段，或正文读着像 AI、视角混乱、对话僵硬、节奏平淡时调用。
  触发方式：/prose-craft、/正文规则、「怎么写正文」「这段读着像 AI」「对话太假」
metadata:
  displayName: 正文笔法
---

# prose-craft

写正文时启用；终稿去 AI 味再配 `deslop`。

## Inputs To Read

- `read_chapter`（或用户粘贴）
- 相关 `read_beat` / `read_entity`
- `get_project_outline`

## Procedure — 九条硬规则

1. 视角锁死（禁止无铺垫越知）
2. 动作名词承载画面
3. 刺激→反应链
4. 对话像人话
5. 节奏有呼吸
6. 标点干净
7. 人设味（口头禅/习惯/价值排序）
8. 信息有代价（场景带设定）
9. 收束有钩

## Outputs / Write-Back

- `write_chapter` / `update_chapter`（纯文本无双链）
- 结构：`update_beat`
"""

SKILLS["deslop"] = """---
name: deslop
description: |
  网文去 AI 味的执行手册。检测并清除文本中的 AI 写作痕迹，让文字回归自然、有人味。
  Use when: 用户要去 AI 味 / 终稿润色 / 统一文风 / 减少机翻感。
  触发方式：/deslop、/去AI味、「去AI味」「deslop」「这篇太AI了」
metadata:
  displayName: 去AI味
---

# deslop

三遍法。起草优先 `prose-craft`。

## Inputs To Read

1. `read_chapter` 或粘贴全文
2. 风格基线：`read_entity` / `read_beat`
3. 按需 read_skill_file：`references/anti-ai-writing.md`、`references/banned-words.md`、`references/rhythm-fingerprint.md`

## Procedure

1. 检测：套话、排比过度、情绪标签、解释旁白、均匀节拍 → 只列清单
2. 最小替换：`update_chapter`；保剧情与口头禅
3. 再检 + 向用户报告改动摘要

## Outputs / Write-Back

- 润色正文 → `update_chapter`
"""

SKILLS["title-blurb"] = """---
name: title-blurb
description: |
  网文书名、简介、标签与封面文案的执行手册。
  Use when: 用户要起书名 / 写简介 / 写文案 / 取标签 / 优化点击率。
  触发方式：/title-blurb、/起名、/简介、「起个书名」「写简介」
metadata:
  displayName: 起名简介
---

# title-blurb

## Inputs To Read

- `get_project_outline`、定位类 beat/entity
- 用户题材/平台/卖点
- 按需 `references/title-blurb-formulas.md`

## Procedure

1. 锁定卖点（冲突 + 情绪收益）
2. 书名 5–10 候选（稳妥/打眼/平台向）
3. 短简介 100–200 字，前三句有钩
4. 标签主 3–5 + 长尾
5. 可选封面文案

## Outputs / Write-Back

- `create_beat` / `update_beat` 作品定位
- 回复给可复制候选表
"""

SKILLS["continuity-audit"] = """---
name: continuity-audit
description: |
  长篇连载连续性体检：设定冲突、伏笔失收、人设崩坏、时间线、能力越级。
  Use when: 查连续性 / 查伏笔 / 查人设 / 前后对不上。
  触发方式：/continuity-audit、/连续性检查、「前后对得上吗」
metadata:
  displayName: 连续性审稿
---

# continuity-audit

默认只诊断；用户明确要求再改写。

## Inputs To Read

- `get_project_outline` + `read_beat`
- `list_entities` → `read_entity`
- `list_chapters` → 抽查 `read_chapter`

## Procedure

1. 定范围
2. 建对照表（人物/能力/时间/伏笔/地理）
3. 五维审计
4. 表：`问题 | 证据 | 影响 | 严重度 | 最小修法`
5. 授权后 `update_chapter` / `update_entity` / `update_beat`

## Outputs / Write-Back

- 对话报告；可选 `create_beat` 存报告
"""

SKILLS["long-write"] = """---
name: long-write
description: |
  长篇网文写作执行手册：开书、卷纲、细纲、人物/世界观、章节正文与连续推进。
  Use when: 开长篇 / 写大纲 / 写正文 / 续写章节 / 推进连载。
  触发方式：/long-write、/写长篇、「帮我开书」「续写下一章」
metadata:
  displayName: 长篇写作
---

# long-write

技法细节在 `references/` 按需 `read_skill_file`。

## Inputs To Read

1. `get_project_outline`
2. 相关 `read_beat` / `read_entity`
3. 续写：最近 1–3 章 `read_chapter`
4. 按需技能：`prose-craft`、`continuity-audit`、`deslop`

## Procedure

### 立项

1. 确认题材/平台/字数/基调
2. beats：作品定位、梗概、卷纲、前 3–5 章细纲
3. entities：主角、配角、势力、世界观
4. `update_beat_status` → outline

### 续写

1. 读 outline + 上章 + 实体
2. 明确本章目标（可写细纲 beat）
3. `write_chapter` 纯文本 + sourceBeatIds/entityRefs/beatRefs
4. 源节点 status → draft
5. 核对伏笔类实体/节点

### 返修

- `update_chapter` 最小改；结构先改 beat

## Quality Gates

- 不编造未读设定；章有钩；正文无双链；元数据完整

## Outputs / Write-Back

- 结构 beats / 设定 entities / 正文 chapters
"""

SKILLS["short-write"] = """---
name: short-write
description: |
  短篇网文写作：立项、蓝图、成稿、返修。
  Use when: 写短篇 / 盐言 / 番茄短篇 / 短篇构思 / 设计反转。
  触发方式：/short-write、/写短篇、「写个短篇」
metadata:
  displayName: 短篇写作
---

# short-write

## Procedure

1. 立项卖点 → beat
2. 4–6 段蓝图 beats
3. 最少角色 entities
4. `write_chapter` 分段或整篇
5. 返修 `update_chapter`
6. 包装转 `title-blurb`

## Outputs / Write-Back

- beats / entities / chapters；正文纯文本
"""


def main() -> None:
    for name, content in SKILLS.items():
        path = ROOT / name / "SKILL.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content.lstrip("\n"), encoding="utf-8")
        print(f"wrote {name}")
    print(f"done {len(SKILLS)}")


if __name__ == "__main__":
    main()
