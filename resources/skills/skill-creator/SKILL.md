---
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

禁止：`workspace_*`、`skill_manage`、不存在的 FS 工具；通用 `read_file` 读技能目录（应用 `read_skill_file` 读**本技能** references）。

### 4. 安装

单根 ZIP（一个 SKILL.md）→ 技能页导入 → 启用 → `list_skills` 可见。

## Quality Gates

- name=目录名；description 可发现
- 工具名真实；双链规则写明
- description 触发面清晰，避免与常见写作任务描述完全撞车

## Reference Map

本包：`references/skill-template.md`、`references/description-writing.md`（按需 `read_skill_file`）
