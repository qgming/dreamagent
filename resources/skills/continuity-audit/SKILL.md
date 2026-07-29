---
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
  - `sourceBeatIds`：取材/覆盖的源节点（写完可据此 `edit({ path: "beats/{id}", status })`）
  - `entityRefs`：文中涉及的实体 id
  - `beatRefs`：文中涉及的其他节点 id

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


## 图怎么查

1. `list({ path: "outline" })` 定范围节点
2. `read({ path: "beats/{id}" })` / `read({ path: "entities/{id}" })` 吃 **outbound + inbound + suggestedReads**（双链即证据网络）
3. `list({ path: "chapters" })` + `read({ path: "chapters/{id}" })`，核对其 `sourceBeatIds` / `entityRefs` / `beatRefs` 是否与正文一致
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
| 纲/任务卡错 | `write/edit path=beats/{id}`（可调双链） |
| 人设/设定错 | `write/edit path=entities/{id}` |
| 正文不一致 | `write/edit path=chapters/{id}`（纯文本+元数据） |
| 存报告 | `write({ type: "beat", ... })`「连续性报告」并双链到相关对象 |
| 节点已完稿 | `edit({ path: "beats/{id}", status })` → final |

## Quality Gates

- 每条有 id 级证据；区分硬伤/偏好；修法不引入新矛盾
