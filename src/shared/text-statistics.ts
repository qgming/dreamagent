/**
 * Deterministic text statistics shared by the Agent runtime and tests.
 * Line numbers are 1-based; offsets are UTF-16 offsets in normalized text.
 */

export type TextStatsProfile = 'basic' | 'story-humanizer'
export type DialogueExpectation = 'none' | 'some' | 'driving'

export interface TextStatsOptions {
  terms?: string[]
  includeContext?: boolean
  includeParagraphTermCounts?: boolean
  maxMatches?: number
  contextChars?: number
  segmentCount?: number
  profile?: TextStatsProfile
  dialogueExpectation?: DialogueExpectation
  /** 可选：用于比较作者自身风格的参考正文，不会参与当前正文的计数。 */
  referenceTexts?: string[]
  /** 与 referenceTexts 同顺序的来源标签，便于解释基线结果。 */
  referenceLabels?: string[]
}

export interface TextStatsFinding {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  value?: number
  threshold?: number
}

export interface TextStatsTermLocation {
  line: number
  paragraph: number | null
  column: number
  offset: number
  context?: string
}

export interface TextStatsTermLineHit {
  line: number
  paragraph: number | null
  count: number
  columns: number[]
  contexts?: string[]
}

export interface TextStatsTermResult {
  term: string
  count: number
  lineHits: TextStatsTermLineHit[]
  truncated: boolean
}

export interface TextStatsParagraph {
  paragraph: number
  startLine: number
  endLine: number
  rawLength: number
  visibleCharCount: number
  wordLikeCount: number
  sentenceEndCount: number
  sentenceCount: number
  dialogueCharCount: number
  dialogueRatio: number
  isShort: boolean
  isLong: boolean
  termCounts?: Record<string, number>
}

export interface TextStatsSegment {
  segment: number
  startLine: number
  endLine: number
  paragraphStart: number
  paragraphEnd: number
  visibleCharCount: number
  sentenceEndCount: number
  sentenceEndDensityPerThousand: number
  dialogueRatio: number
  consecutiveSentencesWithoutDialogue: number
  riskFlags: string[]
  excerpt?: string
}

export interface TextStatsDistribution {
  average: number
  median: number
  p10: number
  p90: number
  standardDeviation: number
  coefficientOfVariation: number
}

export interface TextStatsSummary {
  rawLength: number
  visibleCharCount: number
  wordLikeCount: number
  lineCount: number
  paragraphCount: number
  sentenceEndCount: number
  sentenceCount: number
  sentenceEndDensityPerThousand: number
  paragraphsPerThousand: number
  sentenceLength: TextStatsDistribution
  paragraphLength: TextStatsDistribution
  deCount: number
  deDensityPerThousand: number
  dialogueCharCount: number
  dialogueRatio: number
  shortParagraphCount: number
  shortParagraphRatio: number
  longParagraphCount: number
  longParagraphRatio: number
  maxParagraphVisibleCharCount: number
  dashCount: number
  exclamationCount: number
  modalWordCount: number
  averageSentenceVisibleCharCount: number
  maxSentenceVisibleCharCount: number
  longSentenceRatio: number
  commaCount: number
  commaDensityPerHundred: number
  sentenceStartRepeatRatio: number
  exactRepeatedSentenceCount: number
  repeatedPhraseCount: number
  dialogueTurnCount: number
  averageDialogueTurnVisibleCharCount: number
}

export interface TextStatsBaselineMetric {
  name: string
  current: number
  median: number
  min: number
  max: number
  delta: number
  normalizedDelta: number
  withinReferenceRange: boolean
}

export interface TextStatsBaselineResult {
  sampleCount: number
  labels: string[]
  distance: number
  metrics: TextStatsBaselineMetric[]
  findings: TextStatsFinding[]
}

export interface TextStatsProfileResult {
  name: TextStatsProfile
  ruleVersion: string
  dialogueExpectation: DialogueExpectation
  structureScore: number
  /** @deprecated 使用 structureScore；保留 score 兼容已有调用方。 */
  score: number
  findings: TextStatsFinding[]
  segments: TextStatsSegment[]
}

export interface TextStatsData {
  summary: TextStatsSummary
  terms: TextStatsTermResult[]
  paragraphs: TextStatsParagraph[]
  profile?: TextStatsProfileResult
  baseline?: TextStatsBaselineResult
  sourceHash: string
}

export interface TextComparisonTokenDelta {
  token: string
  before: number
  after: number
}

export interface TextComparisonResult {
  preserved: boolean
  before: TextStatsSummary
  after: TextStatsSummary
  visibleCharDelta: number
  sentenceCountDelta: number
  removedNumbers: string[]
  addedNumbers: string[]
  protectedTerms: TextComparisonTokenDelta[]
  removedDialogueCount: number
  findings: TextStatsFinding[]
}

interface LineInfo {
  text: string
  start: number
  end: number
}

interface ParagraphInfo {
  paragraph: number
  startLine: number
  endLine: number
  start: number
  end: number
  text: string
}

interface SentenceUnit {
  start: number
  end: number
  hasDialogue: boolean
}

interface Range {
  start: number
  end: number
}

const SENTENCE_END_RE = /[。！？!?]/gu
const DIALOGUE_OPENERS = new Map<string, string>([
  ['「', '」'],
  ['『', '』'],
  ['“', '”'],
  ['‘', '’'],
  ['"', '"'],
  ["'", "'"]
])
const MODAL_WORDS = ['诶', '唉', '呢', '哟', '吧']

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/gu, '\n')
}

function countVisibleChars(text: string): number {
  return Array.from(text).filter((char) => !/\s/u.test(char)).length
}

function countWordLikeChars(text: string): number {
  return Array.from(text).filter((char) => /[\p{L}\p{N}]/u.test(char)).length
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))].length
}

function countLiteral(text: string, literal: string): number {
  if (!literal) return 0
  let count = 0
  let offset = 0
  while (true) {
    const index = text.indexOf(literal, offset)
    if (index < 0) return count
    count += 1
    offset = index + literal.length
  }
}

function buildLines(text: string): LineInfo[] {
  if (!text) return []
  const lines = text.split('\n')
  let offset = 0
  return lines.map((line) => {
    const info = { text: line, start: offset, end: offset + line.length }
    offset += line.length + 1
    return info
  })
}

function buildParagraphs(text: string, lines: LineInfo[]): ParagraphInfo[] {
  const paragraphs: ParagraphInfo[] = []
  let startLine = -1

  const flush = (endLine: number): void => {
    if (startLine < 0) return
    const start = lines[startLine]!.start
    const end = lines[endLine]!.end
    paragraphs.push({
      paragraph: paragraphs.length + 1,
      startLine: startLine + 1,
      endLine: endLine + 1,
      start,
      end,
      text: text.slice(start, end)
    })
    startLine = -1
  }

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]!.text.trim() === '') {
      flush(i - 1)
    } else if (startLine < 0) {
      startLine = i
    }
  }
  flush(lines.length - 1)
  return paragraphs
}

function findLineIndex(lines: LineInfo[], offset: number): number {
  let low = 0
  let high = lines.length - 1
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const line = lines[middle]!
    if (offset < line.start) high = middle - 1
    else if (offset > line.end) low = middle + 1
    else return middle
  }
  return Math.max(0, Math.min(lines.length - 1, low))
}

function findParagraphForLine(paragraphs: ParagraphInfo[], line: number): ParagraphInfo | undefined {
  return paragraphs.find((paragraph) => line >= paragraph.startLine - 1 && line <= paragraph.endLine - 1)
}

function quoteRanges(text: string): Range[] {
  const stack: Array<{ opener: string; closer: string; start: number }> = []
  const ranges: Range[] = []

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!
    const top = stack[stack.length - 1]
    if (top && char === top.closer) {
      // Store the quoted body only; the quote marks are not dialogue characters.
      ranges.push({ start: top.start + 1, end: index })
      stack.pop()
      continue
    }
    const closer = DIALOGUE_OPENERS.get(char)
    if (closer) {
      if (closer === char && top?.closer === char) continue
      stack.push({ opener: char, closer, start: index })
    }
  }
  return mergeRanges(ranges)
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: Range[] = []
  for (const range of sorted) {
    const previous = merged[merged.length - 1]
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

function rangeLengthInText(text: string, ranges: Range[], start: number, end: number): number {
  return ranges.reduce((total, range) => {
    const overlapStart = Math.max(start, range.start)
    const overlapEnd = Math.min(end, range.end)
    return overlapEnd > overlapStart ? total + countVisibleChars(text.slice(overlapStart, overlapEnd)) : total
  }, 0)
}

function sentenceUnits(text: string, ranges: Range[]): SentenceUnit[] {
  const units: SentenceUnit[] = []
  let start = 0
  for (const match of text.matchAll(/[。！？!?]+/gu)) {
    const end = match.index! + match[0].length
    if (end > start) {
      units.push({
        start,
        end,
        hasDialogue: ranges.some((range) => range.start < end && range.end > start)
      })
    }
    start = end
  }
  if (start < text.length && text.slice(start).trim()) {
    units.push({
      start,
      end: text.length,
      hasDialogue: ranges.some((range) => range.start < text.length && range.end > start)
    })
  }
  return units
}

function sentenceTexts(text: string, units: SentenceUnit[]): string[] {
  return units
    .map((unit) => text.slice(unit.start, unit.end).trim())
    .filter(Boolean)
}

function sentenceStartKey(text: string): string {
  const clean = text
    .trim()
    .replace(/^[\s"'“”‘’「」『』（）()【】《》、，。！？!?：:；;…—-]+/gu, '')
  return Array.from(clean).slice(0, 4).join('')
}

function repeatAfterFirst(values: string[]): number {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0)
}

function normalizeSentenceForRepeat(text: string): string {
  return text.replace(/[\s\u3000]+/gu, '').replace(/[。！？!?]+$/gu, '')
}

function repeatedPhraseCount(text: string): number {
  const counts = new Map<string, number>()
  const runs = text
    .split(/[\s\u3000，。！？!?；;：:“”‘’「」『』（）()【】《》、…—-]/gu)
    .map((run) => Array.from(run).join(''))
    .filter((run) => run.length >= 8)
  for (const run of runs) {
    for (let index = 0; index <= run.length - 8; index += 1) {
      const phrase = Array.from(run).slice(index, index + 8).join('')
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1)
    }
  }
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0)
}

function countTokens(text: string, pattern: RegExp): Map<string, number> {
  const counts = new Map<string, number>()
  for (const match of text.matchAll(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))) {
    const token = match[0]
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  return counts
}

function mapTokenDelta(before: Map<string, number>, after: Map<string, number>): TextComparisonTokenDelta[] {
  const tokens = new Set([...before.keys(), ...after.keys()])
  return [...tokens]
    .map((token) => ({ token, before: before.get(token) ?? 0, after: after.get(token) ?? 0 }))
    .filter((item) => item.before !== item.after)
    .sort((a, b) => a.token.localeCompare(b.token))
}

function average(values: number[]): number {
  if (!values.length) return 0
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
}

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]!
  const value = sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower)
  return Math.round(value * 10) / 10
}

function distribution(values: number[]): TextStatsDistribution {
  if (!values.length) {
    return {
      average: 0,
      median: 0,
      p10: 0,
      p90: 0,
      standardDeviation: 0,
      coefficientOfVariation: 0
    }
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const standardDeviation = Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  )
  return {
    average: average(values),
    median: percentile(values, 0.5),
    p10: percentile(values, 0.1),
    p90: percentile(values, 0.9),
    standardDeviation: Math.round(standardDeviation * 10) / 10,
    coefficientOfVariation: mean > 0 ? Math.round((standardDeviation / mean) * 1000) / 1000 : 0
  }
}

function ratio(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 1000) / 1000 : 0
}

function perThousand(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 1000 * 10) / 10 : 0
}

function perHundred(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100 * 10) / 10 : 0
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function contextAround(text: string, start: number, end: number, radius: number): string {
  const left = Math.max(0, start - radius)
  const right = Math.min(text.length, end + radius)
  return text.slice(left, right).replace(/\n/gu, '\\n')
}

function sourceHash(text: string): string {
  let hash = 2166136261
  const bytes = new TextEncoder().encode(text)
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function profileTerms(_profile: TextStatsProfile | undefined): string[] {
  // 普通词语不再因单次出现自动进入“禁词”结果；需要检查时由调用方显式传 terms。
  return []
}

function termResults(
  text: string,
  terms: string[],
  lines: LineInfo[],
  paragraphs: ParagraphInfo[],
  options: Required<Pick<TextStatsOptions, 'includeContext' | 'includeParagraphTermCounts' | 'maxMatches' | 'contextChars'>>
): { results: TextStatsTermResult[]; paragraphCounts: Map<number, Record<string, number>> } {
  const paragraphCounts = new Map<number, Record<string, number>>()
  for (const paragraph of paragraphs) paragraphCounts.set(paragraph.paragraph, {})

  const results = terms.map((term) => {
    const lineHits = new Map<number, TextStatsTermLineHit>()
    let count = 0
    let sampled = 0
    let offset = 0
    while (term) {
      const index = text.indexOf(term, offset)
      if (index < 0) break
      count += 1
      const lineIndex = findLineIndex(lines, index)
      const paragraph = findParagraphForLine(paragraphs, lineIndex)
      const paragraphNumber = paragraph?.paragraph ?? null
      if (paragraphNumber !== null) {
        const counts = paragraphCounts.get(paragraphNumber)!
        counts[term] = (counts[term] ?? 0) + 1
      }
      const line = lines[lineIndex]!
      let hit = lineHits.get(lineIndex)
      if (!hit) {
        hit = {
          line: lineIndex + 1,
          paragraph: paragraphNumber,
          count: 0,
          columns: [],
          ...(options.includeContext ? { contexts: [] } : {})
        }
        lineHits.set(lineIndex, hit)
      }
      hit.count += 1
      if (sampled < options.maxMatches) {
        const column = Array.from(line.text.slice(0, Math.max(0, index - line.start))).length + 1
        hit.columns.push(column)
        if (options.includeContext) hit.contexts!.push(contextAround(text, index, index + term.length, options.contextChars))
        sampled += 1
      }
      offset = index + Math.max(1, term.length)
    }
    return {
      term,
      count,
      lineHits: [...lineHits.values()],
      truncated: sampled < count
    }
  })
  return { results, paragraphCounts }
}

function buildFindings(
  summary: TextStatsSummary,
  noDialogueRuns: number,
  dialogueExpectation: DialogueExpectation
): TextStatsFinding[] {
  const findings: TextStatsFinding[] = []
  if (summary.visibleCharCount >= 1000 && (summary.sentenceEndDensityPerThousand < 15 || summary.sentenceEndDensityPerThousand > 65)) {
    findings.push({
      code: 'sentence-density-extreme',
      severity: 'error',
      message: '句末密度明显偏离 5 篇人类样文的参考范围（约 23-50/千字）',
      value: summary.sentenceEndDensityPerThousand,
      threshold: summary.sentenceEndDensityPerThousand < 15 ? 15 : 65
    })
  } else if (summary.visibleCharCount >= 1000 && (summary.sentenceEndDensityPerThousand < 20 || summary.sentenceEndDensityPerThousand > 55)) {
    findings.push({
      code: 'sentence-density-outside-sample-range',
      severity: 'warning',
      message: '句末密度超出样文附近的软参考范围（20-55/千字），先检查局部节奏，不要机械合并或拆句',
      value: summary.sentenceEndDensityPerThousand,
      threshold: summary.sentenceEndDensityPerThousand < 20 ? 20 : 55
    })
  }
  if (summary.deDensityPerThousand < 12 && summary.visibleCharCount >= 1000) {
    findings.push({ code: 'de-density-low', severity: 'info', message: '“的”密度偏低，仅提示检查修饰是否过少，不自动判定文风问题', value: summary.deDensityPerThousand, threshold: 12 })
  }
  if (summary.paragraphsPerThousand < 15 && summary.visibleCharCount >= 1000) {
    findings.push({ code: 'paragraph-density-low', severity: 'info', message: '每千字段落数偏低，建议定位是否存在信息堆叠的大段，而不是追求固定段数', value: summary.paragraphsPerThousand, threshold: 15 })
  }
  if (summary.visibleCharCount >= 1000 && summary.shortParagraphRatio < 0.15 && summary.paragraphCount > 0) {
    findings.push({ code: 'short-paragraph-ratio-low', severity: 'info', message: '短段占比低于样文观察下限 15%，建议结合阅读节奏人工复核', value: summary.shortParagraphRatio, threshold: 0.15 })
  }
  if (summary.longParagraphCount >= 25 && summary.longParagraphRatio >= 0.25) {
    findings.push({ code: 'long-paragraphs-extreme', severity: 'error', message: '超长段数量和占比都明显高于 5 篇人类样文', value: summary.longParagraphCount, threshold: 25 })
  } else if (summary.longParagraphCount >= 17 && summary.longParagraphRatio >= 0.17) {
    findings.push({ code: 'long-paragraphs-outside-sample-range', severity: 'warning', message: '超长段超过样文观察上限，建议只定位具体段落复核', value: summary.longParagraphCount, threshold: 17 })
  }
  if (dialogueExpectation === 'some' && summary.dialogueCharCount === 0 && summary.visibleCharCount > 0) {
    findings.push({ code: 'dialogue-absent', severity: 'warning', message: '本章节标记为需要对话，但未检测到引号内对话', value: 0, threshold: 1 })
  } else if (dialogueExpectation === 'driving' && summary.dialogueRatio < 0.1 && summary.visibleCharCount > 0) {
    findings.push({ code: 'dialogue-ratio-low-soft', severity: 'info', message: '对话驱动章节的对话占比低于 10%，建议复核但不直接判定不合格', value: summary.dialogueRatio, threshold: 0.1 })
  }
  if (summary.dashCount > 0) {
    findings.push({ code: 'dash-present', severity: 'info', message: '正文包含破折号，仅作为可选风格复核项，不自动扣分', value: summary.dashCount, threshold: 0 })
  }
  if (summary.modalWordCount === 0) {
    findings.push({ code: 'modal-words-none', severity: 'info', message: '未检测到常用语气词', value: 0, threshold: 1 })
  }
  if (summary.exactRepeatedSentenceCount > 0) {
    findings.push({ code: 'repeated-sentences', severity: 'info', message: '发现完全重复的句子，建议检查是否是有意复现或误重复', value: summary.exactRepeatedSentenceCount, threshold: 1 })
  }
  if (summary.repeatedPhraseCount >= 2) {
    findings.push({ code: 'repeated-phrases', severity: 'info', message: '发现重复的八字短语，建议结合上下文确认是口头禅、术语还是机械复用', value: summary.repeatedPhraseCount, threshold: 2 })
  }
  if (summary.sentenceStartRepeatRatio >= 0.25) {
    findings.push({ code: 'sentence-start-repetition', severity: 'info', message: '句子开头重复率偏高，建议检查是否形成机械节奏', value: summary.sentenceStartRepeatRatio, threshold: 0.25 })
  }
  if (dialogueExpectation === 'driving' && noDialogueRuns > 0) {
    findings.push({ code: 'long-narration-runs', severity: 'info', message: '存在连续 3 句以上无对话的叙述区间，仅定位复核，不自动扣分', value: noDialogueRuns, threshold: 3 })
  }
  return findings
}

function profileScore(findings: TextStatsFinding[]): number {
  const penalty = findings.reduce((total, finding) => {
    if (finding.severity === 'error') return total + 15
    if (finding.severity === 'warning') return total + 5
    return total
  }, 0)
  return Math.max(0, 100 - penalty)
}

const BASELINE_METRICS: Array<{ name: string; get: (summary: TextStatsSummary) => number }> = [
  { name: 'sentenceEndDensityPerThousand', get: (summary) => summary.sentenceEndDensityPerThousand },
  { name: 'paragraphsPerThousand', get: (summary) => summary.paragraphsPerThousand },
  { name: 'averageSentenceVisibleCharCount', get: (summary) => summary.averageSentenceVisibleCharCount },
  { name: 'sentenceLengthCoefficientOfVariation', get: (summary) => summary.sentenceLength.coefficientOfVariation },
  { name: 'commaDensityPerHundred', get: (summary) => summary.commaDensityPerHundred },
  { name: 'shortParagraphRatio', get: (summary) => summary.shortParagraphRatio },
  { name: 'longParagraphRatio', get: (summary) => summary.longParagraphRatio },
  { name: 'dialogueRatio', get: (summary) => summary.dialogueRatio },
  { name: 'sentenceStartRepeatRatio', get: (summary) => summary.sentenceStartRepeatRatio }
]

function buildBaselineComparison(
  current: TextStatsSummary,
  referenceTexts: string[],
  dialogueExpectation: DialogueExpectation,
  referenceLabels: string[] = []
): TextStatsBaselineResult | undefined {
  const references = referenceTexts
    .map((text, index) => ({ text, index }))
    .filter(({ text }) => typeof text === 'string' && text.trim())
  if (!references.length) return undefined
  const referenceSummaries = references.map(({ text }) => analyzeText(text, { dialogueExpectation }).summary)
  const metrics = BASELINE_METRICS.map(({ name, get }) => {
    const values = referenceSummaries.map(get)
    const median = percentile(values, 0.5)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const currentValue = get(current)
    const scale = Math.max(max - min, Math.abs(median) * 0.2, 1)
    return {
      name,
      current: round(currentValue),
      median: round(median),
      min: round(min),
      max: round(max),
      delta: round(currentValue - median),
      normalizedDelta: round(Math.abs(currentValue - median) / scale),
      withinReferenceRange: currentValue >= min && currentValue <= max
    }
  })
  const distance = round(metrics.reduce((sum, metric) => sum + metric.normalizedDelta, 0) / metrics.length)
  const findings: TextStatsFinding[] = []
  if (distance >= 2) {
    findings.push({ code: 'author-style-distance-high', severity: 'warning', message: '当前文章与参考作者样本的多项结构分布差异较大，建议人工确认题材或场景是否不同', value: distance, threshold: 2 })
  } else if (distance >= 1) {
    findings.push({ code: 'author-style-distance-review', severity: 'info', message: '当前文章与参考作者样本存在可复核的结构差异，不代表质量或来源问题', value: distance, threshold: 1 })
  }
  return {
    sampleCount: references.length,
    labels: references.map(({ index }) => referenceLabels[index] || `参考样本 ${index + 1}`),
    distance,
    metrics,
    findings
  }
}

function buildSegments(
  text: string,
  paragraphs: ParagraphInfo[],
  ranges: Range[],
  count: number,
  includeExcerpt: boolean,
  dialogueExpectation: DialogueExpectation
): TextStatsSegment[] {
  if (!paragraphs.length) return []
  const segmentCount = Math.max(1, Math.min(count, paragraphs.length))
  const target = paragraphs.reduce((sum, paragraph) => sum + countVisibleChars(paragraph.text), 0) / segmentCount
  const groups: ParagraphInfo[][] = []
  let current: ParagraphInfo[] = []
  let currentChars = 0
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index]!
    current.push(paragraph)
    currentChars += countVisibleChars(paragraph.text)
    const remainingParagraphs = paragraphs.length - index - 1
    const remainingGroups = segmentCount - groups.length - 1
    if (groups.length < segmentCount - 1 && currentChars >= target && remainingParagraphs >= remainingGroups) {
      groups.push(current)
      current = []
      currentChars = 0
    }
  }
  if (current.length) groups.push(current)

  return groups.map((group, index) => {
    const first = group[0]!
    const last = group[group.length - 1]!
    const segmentText = text.slice(first.start, last.end)
    const visibleCharCount = countVisibleChars(segmentText)
    const sentenceEndCount = countMatches(segmentText, SENTENCE_END_RE)
    const dialogueCharCount = rangeLengthInText(text, ranges, first.start, last.end)
    const units = sentenceUnits(segmentText, ranges
      .filter((range) => range.start < last.end && range.end > first.start)
      .map((range) => ({ start: Math.max(0, range.start - first.start), end: Math.min(segmentText.length, range.end - first.start) })))
    let currentNoDialogue = 0
    let maxNoDialogue = 0
    for (const unit of units) {
      currentNoDialogue = unit.hasDialogue ? 0 : currentNoDialogue + 1
      maxNoDialogue = Math.max(maxNoDialogue, currentNoDialogue)
    }
    const riskFlags: string[] = []
    if (dialogueExpectation === 'some' && dialogueCharCount === 0) riskFlags.push('dialogue-absent')
    if (dialogueExpectation === 'driving' && ratio(dialogueCharCount, visibleCharCount) < 0.1) {
      riskFlags.push('dialogue-low-soft')
    }
    if (dialogueExpectation === 'driving' && maxNoDialogue >= 3) riskFlags.push('narration-run')
    const segment: TextStatsSegment = {
      segment: index + 1,
      startLine: first.startLine,
      endLine: last.endLine,
      paragraphStart: first.paragraph,
      paragraphEnd: last.paragraph,
      visibleCharCount,
      sentenceEndCount,
      sentenceEndDensityPerThousand: perThousand(sentenceEndCount, visibleCharCount),
      dialogueRatio: ratio(dialogueCharCount, visibleCharCount),
      consecutiveSentencesWithoutDialogue: maxNoDialogue,
      riskFlags
    }
    if (includeExcerpt) segment.excerpt = segmentText.slice(0, 180).replace(/\n/gu, '\\n')
    return segment
  })
}

export function analyzeText(text: string, options: TextStatsOptions = {}): TextStatsData {
  const normalized = normalizeNewlines(text)
  const lines = buildLines(normalized)
  const paragraphs = buildParagraphs(normalized, lines)
  const ranges = quoteRanges(normalized)
  const units = sentenceUnits(normalized, ranges)
  const visibleCharCount = countVisibleChars(normalized)
  const sentenceEndCount = countMatches(normalized, SENTENCE_END_RE)
  const sentenceLengths = units.map((unit) => countVisibleChars(normalized.slice(unit.start, unit.end)))
  const sentenceTextValues = sentenceTexts(normalized, units)
  const sentenceStartKeys = sentenceTextValues.map(sentenceStartKey).filter(Boolean)
  const repeatedSentenceValues = sentenceTextValues
    .map(normalizeSentenceForRepeat)
    .filter(Boolean)
  const dialogueTurnLengths = ranges.map((range) => countVisibleChars(normalized.slice(range.start, range.end)))
  const paragraphResults: TextStatsParagraph[] = paragraphs.map((paragraph) => {
    const paragraphRanges = quoteRanges(paragraph.text)
    const paragraphVisibleCharCount = countVisibleChars(paragraph.text)
    const dialogueCharCount = rangeLengthInText(paragraph.text, paragraphRanges, 0, paragraph.text.length)
    const paragraphSentenceEndCount = countMatches(paragraph.text, SENTENCE_END_RE)
    return {
      paragraph: paragraph.paragraph,
      startLine: paragraph.startLine,
      endLine: paragraph.endLine,
      rawLength: paragraph.text.length,
      visibleCharCount: paragraphVisibleCharCount,
      wordLikeCount: countWordLikeChars(paragraph.text),
      sentenceEndCount: paragraphSentenceEndCount,
      sentenceCount: sentenceUnits(paragraph.text, paragraphRanges).length,
      dialogueCharCount,
      dialogueRatio: ratio(dialogueCharCount, paragraphVisibleCharCount),
      isShort: paragraphVisibleCharCount <= 20,
      isLong: paragraphVisibleCharCount > 60
    }
  })

  const includeContext = options.includeContext ?? true
  const includeParagraphTermCounts = options.includeParagraphTermCounts ?? true
  const maxMatches = Math.max(1, Math.min(options.maxMatches ?? 200, 2000))
  const contextChars = Math.max(0, Math.min(options.contextChars ?? 24, 120))
  const terms = [...new Set([...profileTerms(options.profile), ...(options.terms ?? [])].map((term) => term.trim()).filter(Boolean))]
  const termOutput = termResults(normalized, terms, lines, paragraphs, {
    includeContext,
    includeParagraphTermCounts,
    maxMatches,
    contextChars
  })
  const dialogueExpectation = options.dialogueExpectation ?? 'none'
  if (includeParagraphTermCounts) {
    for (const paragraph of paragraphResults) {
      paragraph.termCounts = termOutput.paragraphCounts.get(paragraph.paragraph) ?? {}
    }
  }

  const noDialogueRuns: Array<{ start: number; end: number }> = []
  let runStart = -1
  for (let index = 0; index < units.length; index += 1) {
    if (units[index]!.hasDialogue) {
      if (runStart >= 0 && index - runStart >= 3) noDialogueRuns.push({ start: runStart, end: index - 1 })
      runStart = -1
    } else if (runStart < 0) {
      runStart = index
    }
  }
  if (runStart >= 0 && units.length - runStart >= 3) noDialogueRuns.push({ start: runStart, end: units.length - 1 })

  const dialogueCharCount = rangeLengthInText(normalized, ranges, 0, normalized.length)
  const shortParagraphCount = paragraphResults.filter((paragraph) => paragraph.isShort).length
  const longParagraphCount = paragraphResults.filter((paragraph) => paragraph.isLong).length
  const summary: TextStatsSummary = {
    rawLength: text.length,
    visibleCharCount,
    wordLikeCount: countWordLikeChars(normalized),
    lineCount: lines.length,
    paragraphCount: paragraphResults.length,
    sentenceEndCount,
    sentenceCount: units.length,
    sentenceEndDensityPerThousand: perThousand(sentenceEndCount, visibleCharCount),
    paragraphsPerThousand: perThousand(paragraphResults.length, visibleCharCount),
    sentenceLength: distribution(sentenceLengths),
    paragraphLength: distribution(paragraphResults.map((paragraph) => paragraph.visibleCharCount)),
    deCount: countLiteral(normalized, '的'),
    deDensityPerThousand: perThousand(countLiteral(normalized, '的'), visibleCharCount),
    dialogueCharCount,
    dialogueRatio: ratio(dialogueCharCount, visibleCharCount),
    shortParagraphCount,
    shortParagraphRatio: ratio(shortParagraphCount, paragraphResults.length),
    longParagraphCount,
    longParagraphRatio: ratio(longParagraphCount, paragraphResults.length),
    maxParagraphVisibleCharCount: paragraphResults.reduce((max, paragraph) => Math.max(max, paragraph.visibleCharCount), 0),
    dashCount: countMatches(normalized, /——|—/gu),
    exclamationCount: countMatches(normalized, /！|!/gu),
    modalWordCount: MODAL_WORDS.reduce((sum, word) => sum + countLiteral(normalized, word), 0),
    averageSentenceVisibleCharCount: average(sentenceLengths),
    maxSentenceVisibleCharCount: sentenceLengths.reduce((max, value) => Math.max(max, value), 0),
    longSentenceRatio: ratio(sentenceLengths.filter((length) => length > 40).length, sentenceLengths.length),
    commaCount: countMatches(normalized, /,|，/gu),
    commaDensityPerHundred: perHundred(countMatches(normalized, /,|，/gu), visibleCharCount),
    sentenceStartRepeatRatio: ratio(repeatAfterFirst(sentenceStartKeys), sentenceStartKeys.length),
    exactRepeatedSentenceCount: repeatAfterFirst(repeatedSentenceValues),
    repeatedPhraseCount: repeatedPhraseCount(normalized),
    dialogueTurnCount: dialogueTurnLengths.length,
    averageDialogueTurnVisibleCharCount: average(dialogueTurnLengths)
  }
  const profile = options.profile
    ? options.profile === 'story-humanizer'
      ? (() => {
          const findings = buildFindings(summary, noDialogueRuns.length, dialogueExpectation)
          const structureScore = profileScore(findings)
          return {
            name: options.profile,
            ruleVersion: 'story-humanizer-v2',
            dialogueExpectation,
            structureScore,
            score: structureScore,
            findings,
            segments: buildSegments(
              normalized,
              paragraphs,
              ranges,
              options.segmentCount ?? 5,
              includeContext,
              dialogueExpectation
            )
          }
        })()
      : {
          name: options.profile,
          ruleVersion: 'basic-v1',
          dialogueExpectation,
          structureScore: 100,
          score: 100,
          findings: [],
          segments: []
        }
    : undefined

  const baseline = buildBaselineComparison(
    summary,
    options.referenceTexts ?? [],
    dialogueExpectation,
    options.referenceLabels
  )
  return {
    summary,
    terms: termOutput.results,
    paragraphs: paragraphResults,
    ...(profile ? { profile } : {}),
    ...(baseline ? { baseline } : {}),
    sourceHash: sourceHash(text)
  }
}

export function compareText(
  beforeText: string,
  afterText: string,
  protectedTerms: string[] = []
): TextComparisonResult {
  const before = analyzeText(beforeText).summary
  const after = analyzeText(afterText).summary
  const numberDelta = mapTokenDelta(
    countTokens(beforeText, /\d+(?:\.\d+)?(?:%|％)?/gu),
    countTokens(afterText, /\d+(?:\.\d+)?(?:%|％)?/gu)
  )
  const termDelta = mapTokenDelta(
    countTokensByLiterals(beforeText, protectedTerms),
    countTokensByLiterals(afterText, protectedTerms)
  )
  // 对白内容通常会被局部改写；这里只比较对白片段数量，不把改写后的新句子误判为删除。
  const removedDialogueCount = Math.max(0, before.dialogueTurnCount - after.dialogueTurnCount)
  const removedNumbers = numberDelta
    .filter((item) => item.before > item.after)
    .flatMap((item) => Array.from({ length: item.before - item.after }, () => item.token))
  const addedNumbers = numberDelta
    .filter((item) => item.after > item.before)
    .flatMap((item) => Array.from({ length: item.after - item.before }, () => item.token))
  const findings: TextStatsFinding[] = []
  if (removedNumbers.length) {
    findings.push({ code: 'protected-number-removed', severity: 'warning', message: '修改后有数字或百分比减少，请确认时间、数量和限制条件没有被误改', value: removedNumbers.length, threshold: 0 })
  }
  if (termDelta.some((item) => item.before > item.after)) {
    findings.push({ code: 'protected-term-removed', severity: 'warning', message: '修改后有受保护词语减少，请确认人物、地点或专有名词没有被误删', value: termDelta.filter((item) => item.before > item.after).length, threshold: 0 })
  }
  if (removedDialogueCount > 0) {
    findings.push({ code: 'dialogue-removed', severity: 'info', message: '修改后对白片段数量减少，仅提示复核叙事功能是否仍然完整', value: removedDialogueCount, threshold: 0 })
  }
  return {
    preserved: removedNumbers.length === 0 && !termDelta.some((item) => item.before > item.after),
    before,
    after,
    visibleCharDelta: after.visibleCharCount - before.visibleCharCount,
    sentenceCountDelta: after.sentenceCount - before.sentenceCount,
    removedNumbers,
    addedNumbers,
    protectedTerms: termDelta,
    removedDialogueCount,
    findings
  }
}

function countTokensByLiterals(text: string, literals: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  if (!text && literals.length) {
    for (const literal of literals) counts.set(literal, 0)
    return counts
  }
  for (const literal of literals) {
    if (!literal) continue
    counts.set(literal, countLiteral(text, literal))
  }
  return counts
}

export function normalizeTextNewlines(text: string): string {
  return normalizeNewlines(text)
}

export function hashText(text: string): string {
  return sourceHash(text)
}
