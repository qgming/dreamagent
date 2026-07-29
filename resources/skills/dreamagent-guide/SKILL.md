---
name: dreamagent-guide
description: |
  造梦师产品使用指南：节点/实体/文章三类对象、双链真实语法、工具调用顺序、常见失败原因。
  Use when: 不熟悉造梦师、如何创建双链、双链没生效、工具怎么用、项目结构、@名字无效、图谱引用失败。
  触发方式：/dreamagent-guide、/使用指南、「怎么建双链」「双链怎么写」「工具怎么用」
metadata:
  displayName: 造梦师使用指南
  version: "1.2.0"
---

# dreamagent-guide

造梦师（Dream Agent）的**产品与工具手册**。写故事前先读本技能，避免把普通文本当成双链。

## 三类对象

| 对象 | 存什么 | 状态 | content 能否写双链 |
|------|--------|------|-------------------|
| **节点 Beat** | 大纲、章纲、任务、定位 | `idea → outline → draft → final` | **能** |
| **实体 Entity** | 人物、地点、势力、物件、设定 | `active / dormant / archived` | **能** |
| **文章 Chapter** | 读者可见正文 | `draft / final` | **禁止** |

- 成稿进文章，**不要**把长正文回写进 `beat.content`。
- 文章与图谱的关系靠**元数据**：`sourceBeatIds` / `entityRefs` / `beatRefs`。

## 双链：唯一合法语法

```text
[@显示名](entity:真实实体id)
[@显示名](beat:真实节点id)
```

### 完整节点长什么样（content + 底部属性缺一不可）

系统存盘时，**content 里的合法双链会被自动解析**，写入底部属性：

| 字段 | 来源 | 作用 |
|------|------|------|
| `content` | 你写入的正文 | 可读文本 + 内嵌双链语法 |
| `entityRefs` | **从 content 自动解析** | 指向实体的出链 id 列表 |
| `beatRefs` | **从 content 自动解析** | 指向其他节点的出链 id 列表 |

**真实完整示例**（这才算「建边成功」）：

```json
{
  "id": "beat_e007c655-d826-4c81-b373-fd33a4da3351",
  "title": "111",
  "content": "测试 [@123](entity:ent_034070e3-459e-4801-a465-b7f70cd65f0f) cc而是 [@1234](beat:beat_53127c69-ae0a-436d-b729-41f539628118) hh啊哈哈",
  "status": "idea",
  "entityRefs": ["ent_034070e3-459e-4801-a465-b7f70cd65f0f"],
  "beatRefs": ["beat_53127c69-ae0a-436d-b729-41f539628118"]
}
```

自检：

1. content 里每个双链都是 `[@名](entity|beat:真实id)`
2. `entityRefs` 含全部 `entity:` 目标 id
3. `beatRefs` 含全部 `beat:` 目标 id（不含自己）
4. 工具摘要应类似：`已更新节点「111」 · 实体链 1 · 节点链 1`
5. 若摘要是「无双链」→ content 语法无效，图谱**没有**边

> Agent **不必**、也**不能**单独手写 `entityRefs`/`beatRefs` 字段；
> 只需把合法双链写进 `content`，create/update 会自动同步底部属性。

### 正确

```text
[@林远](entity:ent_a1b2c3)
[@卷一开篇](beat:beat_x9y8z7)
```

### 错误（content 看似有字，但 entityRefs/beatRefs 仍为空）

```text
@林远
[[林远]]
[林远]
[@林远](entity)
[@林远](entity:林远)
林远（ent_xxx）   ← 自然语言描述，不是双链
```

**原因**：解析器只认 `[@label](entity|beat:id)`。写纯文本或 `@名字` 只会当普通字存盘，`entityRefs`/`beatRefs` 保持 `[]`，图谱上没有边。

## 正确创建流程（先 id，后双链）

批量建人设并互链时，**必须**按这个顺序：

1. `write({ type: "entity", ... })` / `write({ type: "beat", ... })`，一次一个或一批。
2. 从工具结果读 **`data.id`**（摘要形如 `已创建实体「林远」(ent_…)`）。
3. 需要互联时：`write/edit path=entities/{id}` / `write/edit path=beats/{id}`，在 content 里写入带**真实 id** 的双链。
4. 不要用「猜的 id」或「名字当 id」。

### 示例

```text
# 1) 创建
write({ type: "entity",  name: "林远", content: "少年剑修。" }
# → data.id = ent_111；data.entityRefs = []；摘要「无双链」

write({ type: "entity",  name: "苏晚", content: "医馆学徒。" }
# → data.id = ent_222

# 2) 再互链（update content，系统自动填 entityRefs）
write/edit({ path: "entities/{id}", 
  entityId: "ent_111",
  content: "少年剑修。青梅竹马：[@苏晚](entity:ent_222)"
}
# → data.entityRefs = ["ent_222"]；摘要「实体链 1 · 节点链 0」

write/edit({ path: "entities/{id}", 
  entityId: "ent_222",
  content: "医馆学徒。青梅竹马：[@林远](entity:ent_111)"
}
# → data.entityRefs = ["ent_111"]

# 3) 章纲节点同时链实体 + 节点
write({ type: "beat", 
  title: "第一章·雨夜",
  content: "POV：[@林远](entity:ent_111)。相关：[@苏晚](entity:ent_222)。上承：[@序章](beat:beat_xxx)。"
}
# → data.entityRefs = ["ent_111","ent_222"]
# → data.beatRefs = ["beat_xxx"]
# → 摘要「实体链 2 · 节点链 1」
```

**禁止**：

- 在 `create_*` 的 content 里写还没创建出来的 id
- 只写 `@苏晚` 却期望 `entityRefs` 有值
- 以为返回里只要 content 有字就算建链——必须看 `entityRefs`/`beatRefs`

## 文章怎么关联图谱

`write({ type: "chapter", ... })` / `write/edit path=chapters/{id}`：

- `content`：**纯正文**，禁止任何 `[@…](…)`。
- `sourceBeatIds`：取材的章纲/节点 id 列表。
- `entityRefs`：文中涉及的实体 id（从已读实体收集）。
- `beatRefs`：文中涉及的其他节点 id。

写完后可用 `edit({ path: "beats/{id}", status })` 把源节点从 `outline` 推到 `draft`。

## 工具速查

| 目的 | 工具 |
|------|------|
| 看全局 | `list({ path: "outline" })` / `list({ path: "beats" })` / `list({ path: "entities" })` |
| 读详情 | `read({ path: "beats/{id}" })` 等（看出入链） |
| 创建 | `write({ type: "beat"\|"entity"\|"chapter", title/name, content })` |
| 全量覆盖 | `write({ path: "beats/{id}", content })` |
| 局部改 | `edit({ path, edits: [{ oldText, newText }] })` 或改 status |
| 删除 | `delete({ path: "entities/{id}" })` |
| 写正文 | `write({ type: "chapter", title, content, sourceBeatIds, entityRefs })` |
| 搜索/读网 | `web_search` / `web_fetch` |
| 技能 | `list_skills` → `read_skill` → `read_skill_file` |

写工具串行；读工具可并行。

## 常见失败

| 现象 | 原因 | 处理 |
|------|------|------|
| 写了「@林远」但图谱无边 | 不是合法双链语法 | 改成 `[@林远](entity:真实id)` |
| content 有 `[@…]` 但 `entityRefs`/`beatRefs` 为空 | 语法不完整（缺 id / 类型错）或未走 update content | 检查语法；用工具返回的 data 核对 |
| 摘要显示「无双链」 | content 未被解析出任何合法 mention | 重写 content 为完整 `[@名](entity\|beat:id)` |
| 多条 create 摘要像同一个 | 旧 bug：用 diff 猜新建 id | 已修：返回真实 created；仍以 `data.id` 为准 |
| 文章里写了双链 | 文章禁止双链 | 删掉 content 双链，改填元数据 entityRefs/beatRefs/sourceBeatIds |
| 双链 id 对不上 | 用了名字或编造 id | 只使用工具返回的 id |
| 创建后 content 仍无链 | 创建时还没有对方 id | 先 create 全部，再 update 互链 |

## 与写作技能的分工

- **本技能**：产品模型、双链、工具顺序。
- `long-write` / `short-write`：叙事流程与质量。
- `deslop` / `prose-craft`：句面。
- `continuity-audit`：设定一致性。
- `title-blurb`：书名简介。

不确定工具或双链时，**先读本技能**，再读写作技能。
