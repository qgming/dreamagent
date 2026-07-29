---
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
