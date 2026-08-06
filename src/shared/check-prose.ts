/**
 * check_prose：中文成稿硬禁令与模型化形状检查（沿用 human-writing 技能的检查规则）。
 * 只报警，不自动改文。
 */
export type CheckProseSeverity = 'failure' | 'warning'

export interface CheckProseIssue {
  severity: CheckProseSeverity
  message: string
  line: number
}

export interface CheckProseCounts {
  hanCount: number
  pivots: number
  semanticPivots: number
  anaphoras: number
  nominalizations: number
  jargon: number
  hardStops: number
  roadSigns: number
  contextJargon: number
  lyricWords: number
  markerWords: number
  leftBranches: number
  denseDe: number
}

export interface CheckProseResult {
  /** 是否可直接交稿（无硬性违规） */
  pass: boolean
  hanCount: number
  failures: CheckProseIssue[]
  warnings: CheckProseIssue[]
  counts: CheckProseCounts
}

const HARD_STOPS = ['说白了', '说穿了', '先说结论'] as const

const HARD_JARGON = [
  '赋能',
  '抓手',
  '商业闭环',
  '价值闭环',
  '能力沉淀',
  '拉通',
  '底层逻辑',
  '顶层设计',
  '认知跃迁',
  '价值释放',
  '能力建设',
  '降本增效',
  '内容矩阵',
  '全链路',
  '组合拳',
  '打开想象空间',
  '结构性机会',
  '关键命题',
  '深层逻辑',
  '技术底座',
  '公共底座',
  '技术主权',
  '单点风险',
  '主脊柱',
  '材料锚点',
  '认知增量',
  '迭代闭环'
] as const

const CONTEXT_JARGON = [
  '沉淀',
  '颗粒度',
  '对齐',
  '协同',
  '链路',
  '生态位',
  '心智',
  '范式',
  '方法论',
  '核心变量',
  '打法',
  '想象空间',
  '闭环',
  '不丢'
] as const

const LYRIC_WORDS = [
  '安放',
  '抵达',
  '微光',
  '褶皱',
  '丰盈',
  '滚烫',
  '轻盈',
  '赤裸',
  '剥开'
] as const

const ROAD_SIGNS = [
  '更微妙的是',
  '还有一层',
  '只说对了一半',
  '值得注意的是',
  '需要指出的是',
  '从某种意义上说'
] as const

const FORBIDDEN_PUNCTUATION = [
  { symbol: '：', label: '中文冒号' },
  { symbol: ':', label: '英文冒号' },
  { symbol: '—', label: '破折号' },
  { symbol: '–', label: '连接号式破折号' }
] as const

const QUOTE_OPENERS = new Set(['「', '『', '“', '‘', '"'])

const PIVOT_PATTERNS: RegExp[] = [
  /(?:并)?不是[^。！？\n]{0,90}而是/gu,
  /并非[^。！？\n]{0,90}而是/gu,
  /不在于[^。！？\n]{0,90}而在于/gu,
  /与其说[^。！？\n]{0,90}(?:不如|毋宁|倒不如)/gu,
  /[。！？!?]\s*而是/gu,
  /表面(?:上)?[^。！？\n]{0,90}(?:其实|实际|实则)/gu,
  /看似[^。！？\n]{0,90}(?:其实|实际|实则)/gu
]

const SEMANTIC_PIVOT_PATTERNS: RegExp[] = [
  /(?:总|一直|曾|都)?以为[^！？\n]{2,60}?(?:其实|才发现|才明白|才知道|后来才)/gu,
  /(?:总|都|一直)以为[^！？\n]{2,60}?[。，](?:可|但|其实)/gu,
  /回头(?:看|一看)?才(?:发现|明白|知道)/gu,
  /(?:并)?不是[^。！？\n]{1,40}，(?:更|才)?是[^，。！？\n]/gu,
  /从来(?:都)?(?:不是|与[^。！？，\n]{1,12}无关)/gu,
  /答案(?:是否定的|恰恰相反)|恰恰相反/gu,
  /表面(?:上)?[^！？\n]{0,60}。[^！？\n]{0,12}(?:其实|实际|实则)/gu,
  /看似[^！？\n]{0,60}。[^！？\n]{0,12}(?:其实|实际|实则)/gu,
  /[^，。！？\n]{1,12}不重要，(?:重要|要紧)的是/gu,
  /真正[^，。！？\n]{0,16}的(?:，)?是/gu,
  /不只(?:是)?[^。！？\n]{0,90}(?:还|也)/gu
]

const NOMINALIZATION_PATTERNS: RegExp[] = [
  /进行(?:了|一次|一场|着)?[^。，！？\n]{0,10}(?:调整|优化|升级|分析|讨论|沟通|梳理|复盘|迭代|探索|尝试|思考|规划|布局)/gu,
  /实现了?[^。，！？\n]{0,14}的?[^。，！？\n]{0,6}(?:提升|增长|突破|转变|跃升|落地)/gu,
  /完成了?对[^。，！？\n]{0,16}的/gu,
  /起到了?[^。，！？\n]{0,12}的?作用/gu,
  /具有[^。，！？\n]{0,10}(?:意义|价值)/gu
]

const CONJUNCTIONS = [
  '因为',
  '所以',
  '但是',
  '然而',
  '同时',
  '此外',
  '而且',
  '并且',
  '因此',
  '不仅'
] as const

const ROAD_SIGN_PATTERNS: RegExp[] = [
  /(?:^|[。！？!?]\s*)更微妙的是[^。！？!?\n]{0,24}/gmu,
  /(?:^|[。！？!?]\s*)还有一层(?=(?:更|原因|问题|意思|考虑|变化|逻辑|价值|作用|风险|影响|值得|很少|不容易|常被|往往))[^。！？!?\n]{0,24}/gmu,
  /(?:^|[。！？!?]\s*)只说对了一半[^。！？!?\n]{0,24}/gmu,
  /(?:^|[。！？!?]\s*)值得注意的是[^。！？!?\n]{0,24}/gmu,
  /(?:^|[。！？!?]\s*)需要指出的是[^。！？!?\n]{0,24}/gmu,
  /(?:^|[。！？!?]\s*)从某种意义上说[^。！？!?\n]{0,24}/gmu
]

const SOFT_MARKERS = [
  '真正',
  '本质上',
  '更深层次',
  '归根结底',
  '换句话说',
  '不可否认',
  '核心是',
  '关键在于',
  '这意味着'
] as const

const REPEATED_OPENERS = [
  '其实',
  '不过',
  '当然',
  '所以',
  '但是',
  '后来',
  '当时',
  '很多人',
  '问题是',
  '更重要的是',
  '说到这里'
] as const

const LEFT_BRANCH_PATTERNS: RegExp[] = [
  /(?:^|[。！？]\s*)在[^，。！？\n]{12,70}(?:以后|之后|之前|以前|过程中|情况下|背景下)，/gu,
  /(?:^|[。！？]\s*)那些[^，。！？\n]{10,60}的[^，。！？\n]{2,30}[，。]/gu,
  /(?:^|[。！？]\s*)(?:真正|最终|最后)让[^，。！？\n]{8,70}的，是/gu
]

const METAPHOR_FIELDS: Record<string, string[]> = {
  温度: ['降温', '升温', '冷却', '余温', '温度最高'],
  生死战争: ['杀死', '死因', '枪响', '开火', '战场', '引爆', '弹药'],
  建筑灾害: ['坍塌', '崩塌', '地基', '砖头', '支柱', '废墟'],
  仓储租赁: ['仓库', '库房', '租金', '取货', '入库', '库存'],
  道路竞赛: ['赛道', '跑道', '岔路', '十字路口', '终点线', '门票'],
  机器器官: ['齿轮', '引擎', '发动机', '血管', '骨架', '肌肉'],
  海洋航行: ['蓝海', '浪潮', '潮水', '航船', '灯塔', '彼岸']
}

const ROAD_STRIP_CHARS = /[。！？!? \n]/gu

export function hanCount(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/gu) || []).length
}

function lineNumber(text: string, position: number): number {
  return text.slice(0, Math.max(0, position)).split('\n').length
}

function excerpt(value: string, width = 72): string {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  return normalized.length <= width ? normalized : `${normalized.slice(0, width - 1)}…`
}

/** 屏蔽代码、网址和机器元数据，同时保留字符位置与换行。 */
function maskNonProse(text: string): string {
  const mask = (match: string): string =>
    Array.from(match)
      .map((char) => (char === '\n' ? '\n' : ' '))
      .join('')

  const patterns: RegExp[] = [
    /^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/gm,
    /```.*?```/gms,
    /`[^`\n]*`/gu,
    /\]\([^\n)]*\)/gu,
    /https?:\/\/[^\s)>]+/gu,
    /<[^>\n]+>/gu
  ]
  let masked = text
  for (const pattern of patterns) {
    masked = masked.replace(pattern, mask)
  }
  return masked
}

interface TermHit {
  position: number
  term: string
}

function nonOverlappingTerms(text: string, terms: readonly string[]): TermHit[] {
  const matches: TermHit[] = []
  const occupied: Array<[number, number]> = []
  const sorted = [...terms].sort((a, b) => b.length - a.length)
  for (const term of sorted) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    const pattern = new RegExp(escaped, 'gu')
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0
      const end = start + term.length
      if (occupied.some(([oldStart, oldEnd]) => start < oldEnd && end > oldStart)) {
        continue
      }
      matches.push({ position: start, term })
      occupied.push([start, end])
    }
  }
  return matches.sort((a, b) => a.position - b.position)
}

function allMatches(text: string, patterns: RegExp[]): RegExpExecArray[] {
  const matches: RegExpExecArray[] = []
  for (const pattern of patterns) {
    const copy = new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g')
    for (const match of text.matchAll(copy)) {
      matches.push(match as RegExpExecArray)
    }
  }
  return matches.sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
}

/** 找出主干可能被多个“的”压到后面的长句。 */
function heavyDeSentences(text: string): RegExpExecArray[] {
  const matches: RegExpExecArray[] = []
  const pattern = /[^。！？!?\n]+(?:[。！？!?]|$)/gu
  for (const match of text.matchAll(pattern)) {
    const value = match[0]
    if (hanCount(value) >= 38 && (value.match(/的/gu) || []).length >= 4) {
      matches.push(match as RegExpExecArray)
    }
  }
  return matches
}

/** 找出同一句里三个以上小句用同一个开头的排比。 */
function anaphoraRuns(text: string, minimum = 3): RegExpExecArray[] {
  const matches: RegExpExecArray[] = []
  const sentencePattern = /[^。！？!?\n]+(?:[。！？!?]|$)/gu
  for (const match of text.matchAll(sentencePattern)) {
    const sentence = match[0]
    const clauses = sentence
      .split(/[，、；,;]/u)
      .map((clause) => clause.trim())
      .filter((clause) => hanCount(clause) >= 3)
    if (clauses.length < minimum) continue
    let run = 1
    for (let i = 1; i < clauses.length; i += 1) {
      const previous = clauses[i - 1]
      const current = clauses[i]
      if (previous.slice(0, 2) === current.slice(0, 2) && /^[\u4e00-\u9fff]{2}/u.test(current)) {
        run += 1
        if (run >= minimum) {
          matches.push(match as RegExpExecArray)
          break
        }
      } else {
        run = 1
      }
    }
  }
  return matches
}

/** 句长变异系数。人写的长短句差距大，模型的句长彼此接近。 */
function sentenceLengthCv(text: string): { cv: number; count: number } | null {
  const lengths: number[] = []
  const pattern = /[^。！？!?\n]+[。！？!?]/gu
  for (const match of text.matchAll(pattern)) {
    const length = hanCount(match[0])
    if (length >= 4) lengths.push(length)
  }
  if (lengths.length < 12) return null
  const mean = lengths.reduce((sum, value) => sum + value, 0) / lengths.length
  if (mean === 0) return null
  const variance =
    lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lengths.length
  return { cv: Math.sqrt(variance) / mean, count: lengths.length }
}

/** 「」括起来的短语。太密说明在批量造金句。 */
function bracketHighlights(text: string): RegExpExecArray[] {
  return [...text.matchAll(/[「『][^」』\n]{1,6}[」』]/gu)] as RegExpExecArray[]
}

interface Paragraph {
  position: number
  text: string
  han: number
  sentences: number
}

function proseParagraphs(text: string): Paragraph[] {
  const paragraphs: Paragraph[] = []
  let cursor = 0
  for (const block of text.split(/\n\s*\n/u)) {
    const position = text.indexOf(block, cursor)
    cursor = Math.max(position + block.length, cursor)
    const clean = block.replace(/[>*_`]/gu, '').trim()
    if (!clean || /^(?:#|http|!\[|```)/u.test(clean)) continue
    if (/^(?:[-+*]|\d+[.、])\s/u.test(clean)) continue
    const count = hanCount(clean)
    if (count < 4) continue
    const sentences = Math.max(1, (clean.match(/[。！？!?]/gu) || []).length)
    paragraphs.push({ position, text: clean, han: count, sentences })
  }
  return paragraphs
}

interface MetaphorHit {
  position: number
  field: string
  word: string
}

function metaphorCluster(
  text: string,
  distance = 800
): { window: MetaphorHit[]; fields: Set<string> } | null {
  const hits: MetaphorHit[] = []
  for (const [field, words] of Object.entries(METAPHOR_FIELDS)) {
    for (const word of words) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
      for (const match of text.matchAll(new RegExp(escaped, 'gu'))) {
        hits.push({ position: match.index ?? 0, field, word })
      }
    }
  }
  hits.sort((a, b) => a.position - b.position)
  for (let index = 0; index < hits.length; index += 1) {
    const start = hits[index].position
    const window = hits.filter((hit) => hit.position - start <= distance)
    const fields = new Set(window.map((hit) => hit.field))
    if (fields.size >= 3) {
      return { window, fields }
    }
  }
  return null
}

function shortStreak(paragraphs: Paragraph[], limit = 4): Paragraph[] | null {
  let streak: Paragraph[] = []
  for (const paragraph of paragraphs) {
    if (paragraph.han <= 24 && paragraph.sentences <= 1) {
      streak.push(paragraph)
      if (streak.length >= limit) return streak
    } else {
      streak = []
    }
  }
  return null
}

function openerCounts(
  paragraphs: Paragraph[]
): { counts: Map<string, number>; examples: Map<string, number> } {
  const counts = new Map<string, number>()
  const examples = new Map<string, number>()
  for (const paragraph of paragraphs) {
    const value = paragraph.text.replace(/^[“‘”"（(]/u, '')
    for (const opener of REPEATED_OPENERS) {
      if (value.startsWith(opener)) {
        counts.set(opener, (counts.get(opener) || 0) + 1)
        examples.set(opener, paragraph.position)
        break
      }
    }
  }
  return { counts, examples }
}

function uniquePreservingOrder(values: string[]): string[] {
  return Array.from(new Set(values))
}

export function checkProse(content: string): CheckProseResult {
  const prose = maskNonProse(content)
  const totalHan = hanCount(prose)
  const failures: CheckProseIssue[] = []
  const warnings: CheckProseIssue[] = []

  if (totalHan === 0) {
    return {
      pass: true,
      hanCount: 0,
      failures: [{ severity: 'failure', line: 1, message: '没有检测到汉字。' }],
      warnings: [],
      counts: emptyCounts()
    }
  }

  // 禁用标点
  const quoteColons: RegExpExecArray[] = []
  for (const { symbol, label } of FORBIDDEN_PUNCTUATION) {
    const matches = [...prose.matchAll(new RegExp(symbol.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'gu'))] as RegExpExecArray[]
    let hard: RegExpExecArray[] = matches
    if (symbol === '：' || symbol === ':') {
      hard = []
      for (const match of matches) {
        const tail = prose.slice(match.index + match[0].length, match.index + match[0].length + 2).replace(/^\s+/u, '')
        if (tail && QUOTE_OPENERS.has(tail[0])) {
          quoteColons.push(match)
        } else {
          hard.push(match)
        }
      }
    }
    if (hard.length) {
      const lines = uniquePreservingOrder(hard.slice(0, 8).map((m) => lineNumber(prose, m.index ?? 0).toString())).join('、')
      failures.push({
        severity: 'failure',
        line: lineNumber(prose, hard[0].index ?? 0),
        message: `${label}共 ${hard.length} 处，出现在第 ${lines} 行。`
      })
    }
  }
  if (quoteColons.length) {
    const lines = uniquePreservingOrder(quoteColons.slice(0, 8).map((m) => lineNumber(prose, m.index ?? 0).toString())).join('、')
    warnings.push({
      severity: 'warning',
      line: lineNumber(prose, quoteColons[0].index ?? 0),
      message: `引出原话的冒号 ${quoteColons.length} 处，第 ${lines} 行。确认引号里确实是原话，且不是提示性用法。`
    })
  }

  const stopMatches = nonOverlappingTerms(prose, HARD_STOPS)
  for (const hit of stopMatches) {
    failures.push({
      severity: 'failure',
      line: lineNumber(prose, hit.position),
      message: `硬停词，第 ${lineNumber(prose, hit.position)} 行，${hit.term}`
    })
  }

  const jargonMatches = nonOverlappingTerms(prose, HARD_JARGON)
  for (const hit of jargonMatches) {
    failures.push({
      severity: 'failure',
      line: lineNumber(prose, hit.position),
      message: `黑话，第 ${lineNumber(prose, hit.position)} 行，${hit.term}`
    })
  }

  const contextJargonMatches = nonOverlappingTerms(prose, CONTEXT_JARGON)
  const hardSpans = jargonMatches.map((hit) => [hit.position, hit.position + hit.term.length] as [number, number])
  const filteredContextJargon = contextJargonMatches.filter(
    (hit) =>
      !hardSpans.some(([start, end]) => hit.position < end && hit.position + hit.term.length > start)
  )
  if (filteredContextJargon.length) {
    const samples = uniquePreservingOrder(filteredContextJargon.map((hit) => hit.term))
    const lines = uniquePreservingOrder(filteredContextJargon.slice(0, 8).map((hit) => lineNumber(prose, hit.position).toString()))
    warnings.push({
      severity: 'warning',
      line: lineNumber(prose, filteredContextJargon[0].position),
      message: `有 ${filteredContextJargon.length} 处词语需要结合语境判断。第 ${lines.join('、')} 行出现 ${samples.join('、')}。本义准确时保留，用来抬价时改写。`
    })
  }

  const roadSigns = allMatches(prose, ROAD_SIGN_PATTERNS)
  for (const match of roadSigns) {
    failures.push({
      severity: 'failure',
      line: lineNumber(prose, match.index ?? 0),
      message: `模型路标，第 ${lineNumber(prose, match.index ?? 0)} 行，“${excerpt(match[0].replace(ROAD_STRIP_CHARS, ''))}”`
    })
  }

  const pivots = allMatches(prose, PIVOT_PATTERNS)
  for (const match of pivots) {
    failures.push({
      severity: 'failure',
      line: lineNumber(prose, match.index ?? 0),
      message: `禁用翻案句，第 ${lineNumber(prose, match.index ?? 0)} 行，“${excerpt(match[0])}”`
    })
  }

  const occupiedSpans = pivots.map((match) => [match.index ?? 0, (match.index ?? 0) + match[0].length] as [number, number])
  const semanticPivots: RegExpExecArray[] = []
  for (const match of allMatches(prose, SEMANTIC_PIVOT_PATTERNS)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (occupiedSpans.some(([s, e]) => start < e && end > s)) continue
    semanticPivots.push(match)
    occupiedSpans.push([start, end])
  }
  for (const match of semanticPivots) {
    warnings.push({
      severity: 'warning',
      line: lineNumber(prose, match.index ?? 0),
      message: `疑似翻案腔变形，第 ${lineNumber(prose, match.index ?? 0)} 行，“${excerpt(match[0], 44)}”。先立误解再推翻就改成正面陈述，正常用法保留。`
    })
  }

  const anaphoras = anaphoraRuns(prose)
  for (const match of anaphoras.slice(0, 4)) {
    warnings.push({
      severity: 'warning',
      line: lineNumber(prose, match.index ?? 0),
      message: `三连以上同构排比，第 ${lineNumber(prose, match.index ?? 0)} 行，“${excerpt(match[0], 44)}”。留两项，第三项换说法或删掉。`
    })
  }

  const lyricMatches = nonOverlappingTerms(prose, LYRIC_WORDS)
  if (lyricMatches.length >= 2) {
    const samples = uniquePreservingOrder(lyricMatches.map((hit) => hit.term))
    warnings.push({
      severity: 'warning',
      line: lineNumber(prose, lyricMatches[0].position),
      message: `模型偏爱的抒情词 ${lyricMatches.length} 处。${samples.join('、')}。写具体事物时保留，给抽象概念穿衣服时删掉。`
    })
  }

  const nominalizations = allMatches(prose, NOMINALIZATION_PATTERNS)
  for (const match of nominalizations.slice(0, 4)) {
    warnings.push({
      severity: 'warning',
      line: lineNumber(prose, match.index ?? 0),
      message: `名词化句式，第 ${lineNumber(prose, match.index ?? 0)} 行，“${excerpt(match[0], 36)}”。还原成直接的动词。`
    })
  }

  const conjunctionHits = nonOverlappingTerms(prose, CONJUNCTIONS)
  if (totalHan >= 600 && (conjunctionHits.length * 1000) / totalHan > 7) {
    const counter = new Map<string, number>()
    for (const hit of conjunctionHits) counter.set(hit.term, (counter.get(hit.term) || 0) + 1)
    const samples = [...counter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([term, count]) => `${term} ${count} 次`)
      .join('、')
    warnings.push({
      severity: 'warning',
      line: lineNumber(prose, conjunctionHits[0].position),
      message: `连词密度偏高，每千字 ${Math.floor((conjunctionHits.length * 1000) / totalHan)} 个。${samples}。中文小句靠语序和事理相接，删掉一半试试。`
    })
  }

  const highlights = bracketHighlights(prose)
  const highlightLimit = Math.max(3, Math.floor(totalHan / 700))
  if (highlights.length > highlightLimit) {
    const samples = uniquePreservingOrder(highlights.slice(0, 6).map((match) => match[0]))
    warnings.push({
      severity: 'warning',
      line: lineNumber(prose, highlights[0].index ?? 0),
      message: `「」括起的短语共 ${highlights.length} 处。${samples.join('、')}。太密说明在批量造金句。`
    })
  }

  const cvResult = sentenceLengthCv(prose)
  if (cvResult && cvResult.cv < 0.42) {
    warnings.push({
      severity: 'warning',
      line: 1,
      message: `全文 ${cvResult.count} 个句子长度过于接近（变异系数 ${cvResult.cv.toFixed(2)}）。人写的段落里十个字的句子会挨着四十个字的句子，放开几句，压短几句。`
    })
  }

  const markerMatches = nonOverlappingTerms(prose, SOFT_MARKERS)
  const markerLimit = Math.max(2, Math.floor(totalHan / 900))
  if (markerMatches.length > markerLimit) {
    const samples = uniquePreservingOrder(markerMatches.map((hit) => hit.term))
    warnings.push({
      severity: 'warning',
      line: lineNumber(prose, markerMatches[0].position),
      message: `洞察路标共 ${markerMatches.length} 处，当前提醒线为 ${markerLimit} 处。重点检查 ${samples.join('、')}。`
    })
  }

  const leftBranches = allMatches(prose, LEFT_BRANCH_PATTERNS)
  const leftLimit = Math.max(2, Math.floor(totalHan / 1200))
  if (leftBranches.length > leftLimit) {
    const samples = leftBranches
      .slice(0, 4)
      .map((match) => `第 ${lineNumber(prose, match.index ?? 0)} 行“${excerpt(match[0], 44)}”`)
      .join('；')
    warnings.push({
      severity: 'warning',
      line: lineNumber(prose, leftBranches[0].index ?? 0),
      message: `长前置成分共 ${leftBranches.length} 处，可能让主干来得太晚。${samples}`
    })
  }

  const denseDe = heavyDeSentences(prose)
  const denseDeLimit = Math.max(1, Math.floor(totalHan / 1500))
  if (denseDe.length > denseDeLimit) {
    const samples = denseDe
      .slice(0, 4)
      .map((match) => `第 ${lineNumber(prose, match.index ?? 0)} 行“${excerpt(match[0], 44)}”`)
      .join('；')
    warnings.push({
      severity: 'warning',
      line: lineNumber(prose, denseDe[0].index ?? 0),
      message: `有 ${denseDe.length} 个长句包含四个以上的“的”，可能要先交代人和动作。${samples}`
    })
  }

  const paragraphs = proseParagraphs(prose)
  if (paragraphs.length >= 10) {
    const oneSentence = paragraphs.filter((paragraph) => paragraph.sentences <= 1).length
    const ratio = oneSentence / paragraphs.length
    if (ratio >= 0.75) {
      warnings.push({
        severity: 'warning',
        line: lineNumber(prose, paragraphs[0].position),
        message: `可识别段落中有 ${Math.round(ratio * 100)}% 只有一句话，可能形成统一的短段鼓点。`
      })
    }
  }

  const streak = shortStreak(paragraphs)
  if (streak) {
    warnings.push({
      severity: 'warning',
      line: lineNumber(prose, streak[0].position),
      message: `从第 ${lineNumber(prose, streak[0].position)} 行起连续出现 ${streak.length} 个短促单句段，检查是否在排队喊结论。`
    })
  }

  const { counts, examples } = openerCounts(paragraphs)
  const repeated = [...counts.entries()].filter(([, count]) => count >= 4)
  if (repeated.length) {
    const details = repeated.map(([opener, count]) => `${opener} ${count} 次`).join('、')
    const firstPosition = Math.min(...repeated.map(([opener]) => examples.get(opener) ?? 0))
    warnings.push({
      severity: 'warning',
      line: lineNumber(prose, firstPosition),
      message: `段落开场重复，从第 ${lineNumber(prose, firstPosition)} 行附近开始。${details}。`
    })
  }

  const metaphors = metaphorCluster(prose)
  if (metaphors) {
    const { window: metaphoreWindow, fields } = metaphors
    const samples = uniquePreservingOrder(metaphoreWindow.map((hit) => hit.word))
    warnings.push({
      severity: 'warning',
      line: lineNumber(prose, metaphoreWindow[0].position),
      message: `八百字内出现 ${fields.size} 套借喻。${[...fields].sort().join('、')}。例词有 ${samples.join('、')}。`
    })
  }

  const countsResult: CheckProseCounts = {
    hanCount: totalHan,
    pivots: pivots.length,
    semanticPivots: semanticPivots.length,
    anaphoras: anaphoras.length,
    nominalizations: nominalizations.length,
    jargon: jargonMatches.length,
    hardStops: stopMatches.length,
    roadSigns: roadSigns.length,
    contextJargon: filteredContextJargon.length,
    lyricWords: lyricMatches.length,
    markerWords: markerMatches.length,
    leftBranches: leftBranches.length,
    denseDe: denseDe.length
  }

  return {
    pass: failures.length === 0,
    hanCount: totalHan,
    failures,
    warnings,
    counts: countsResult
  }
}

function emptyCounts(): CheckProseCounts {
  return {
    hanCount: 0,
    pivots: 0,
    semanticPivots: 0,
    anaphoras: 0,
    nominalizations: 0,
    jargon: 0,
    hardStops: 0,
    roadSigns: 0,
    contextJargon: 0,
    lyricWords: 0,
    markerWords: 0,
    leftBranches: 0,
    denseDe: 0
  }
}

