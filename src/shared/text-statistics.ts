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

export interface TextStatsSummary {
  rawLength: number
  visibleCharCount: number
  wordLikeCount: number
  lineCount: number
  paragraphCount: number
  sentenceEndCount: number
  sentenceCount: number
  sentenceEndDensityPerThousand: number
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
}

export interface TextStatsProfileResult {
  name: TextStatsProfile
  ruleVersion: string
  dialogueExpectation: DialogueExpectation
  score: number
  findings: TextStatsFinding[]
  segments: TextStatsSegment[]
}

export interface TextStatsData {
  summary: TextStatsSummary
  terms: TextStatsTermResult[]
  paragraphs: TextStatsParagraph[]
  profile?: TextStatsProfileResult
  sourceHash: string
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

function average(values: number[]): number {
  if (!values.length) return 0
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
}

function ratio(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 1000) / 1000 : 0
}

function perThousand(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 1000 * 10) / 10 : 0
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
  if (summary.sentenceEndDensityPerThousand < 15 || summary.sentenceEndDensityPerThousand > 65) {
    findings.push({
      code: 'sentence-density-extreme',
      severity: 'error',
      message: '句末密度明显偏离 5 篇人类样文的参考范围（约 23-50/千字）',
      value: summary.sentenceEndDensityPerThousand,
      threshold: summary.sentenceEndDensityPerThousand < 15 ? 15 : 65
    })
  } else if (summary.sentenceEndDensityPerThousand < 20 || summary.sentenceEndDensityPerThousand > 55) {
    findings.push({
      code: 'sentence-density-outside-sample-range',
      severity: 'warning',
      message: '句末密度超出样文附近的软参考范围（20-55/千字），先检查局部节奏，不要机械合并或拆句',
      value: summary.sentenceEndDensityPerThousand,
      threshold: summary.sentenceEndDensityPerThousand < 20 ? 20 : 55
    })
  }
  if (summary.deDensityPerThousand < 12) {
    findings.push({ code: 'de-density-low', severity: 'error', message: '“的”密度低于 12/千字', value: summary.deDensityPerThousand, threshold: 12 })
  } else if (summary.deDensityPerThousand < 18) {
    findings.push({ code: 'de-density-low', severity: 'warning', message: '“的”密度低于 18/千字', value: summary.deDensityPerThousand, threshold: 18 })
  }
  if (summary.paragraphCount < 70) {
    findings.push({ code: 'paragraphs-low', severity: 'error', message: '段落数低于 70', value: summary.paragraphCount, threshold: 70 })
  } else if (summary.paragraphCount < 80) {
    findings.push({ code: 'paragraphs-low', severity: 'warning', message: '段落数低于 80', value: summary.paragraphCount, threshold: 80 })
  }
  if (summary.shortParagraphRatio < 0.15 && summary.paragraphCount > 0) {
    findings.push({ code: 'short-paragraph-ratio-low', severity: 'warning', message: '短段占比低于样文观察下限 15%', value: summary.shortParagraphRatio, threshold: 0.15 })
  }
  if (summary.longParagraphCount >= 25 && summary.longParagraphRatio >= 0.25) {
    findings.push({ code: 'long-paragraphs-extreme', severity: 'error', message: '超长段数量和占比都明显高于 5 篇人类样文', value: summary.longParagraphCount, threshold: 25 })
  } else if (summary.longParagraphCount >= 17 && summary.longParagraphRatio >= 0.17) {
    findings.push({ code: 'long-paragraphs-outside-sample-range', severity: 'warning', message: '超长段超过样文观察上限，建议只定位具体段落复核', value: summary.longParagraphCount, threshold: 17 })
  }
  if (dialogueExpectation === 'some' && summary.dialogueCharCount === 0 && summary.visibleCharCount > 0) {
    findings.push({ code: 'dialogue-absent', severity: 'warning', message: '本章节标记为需要对话，但未检测到引号内对话', value: 0, threshold: 1 })
  } else if (dialogueExpectation === 'driving' && summary.dialogueRatio < 0.1 && summary.visibleCharCount > 0) {
    findings.push({ code: 'dialogue-ratio-low-soft', severity: 'warning', message: '对话驱动章节的对话占比低于 10%，建议复核但不直接判定不合格', value: summary.dialogueRatio, threshold: 0.1 })
  }
  if (summary.dashCount > 0) {
    findings.push({ code: 'dash-present', severity: 'info', message: '正文包含破折号，仅作为可选风格复核项，不自动扣分', value: summary.dashCount, threshold: 0 })
  }
  if (summary.modalWordCount === 0) {
    findings.push({ code: 'modal-words-none', severity: 'info', message: '未检测到常用语气词', value: 0, threshold: 1 })
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
    longSentenceRatio: ratio(sentenceLengths.filter((length) => length > 40).length, sentenceLengths.length)
  }
  const profile = options.profile
    ? options.profile === 'story-humanizer'
      ? (() => {
          const findings = buildFindings(summary, noDialogueRuns.length, dialogueExpectation)
          return {
            name: options.profile,
            ruleVersion: 'story-humanizer-v2',
            dialogueExpectation,
            score: profileScore(findings),
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
          score: 100,
          findings: [],
          segments: []
        }
    : undefined

  return {
    summary,
    terms: termOutput.results,
    paragraphs: paragraphResults,
    ...(profile ? { profile } : {}),
    sourceHash: sourceHash(text)
  }
}

export function normalizeTextNewlines(text: string): string {
  return normalizeNewlines(text)
}

export function hashText(text: string): string {
  return sourceHash(text)
}
