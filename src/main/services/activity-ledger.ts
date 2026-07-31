import path from 'path'
import type {
  ProjectActivityDay,
  WritingActivityDay
} from '../../shared/activity'
import { readJsonFile, writeJsonAtomic } from './fs-utils'

const ACTIVITY_SCHEMA_VERSION = 1
const ACTIVITY_FILE = 'activity.json'

interface TokenActivityEntry {
  id: string
  date: string
  tokens: number
}

interface ActivityLedgerFile {
  version: number
  writing: Record<string, Omit<WritingActivityDay, 'date'>>
  tokens: Record<string, number>
  tokenEntryIds: string[]
}

function emptyLedger(): ActivityLedgerFile {
  return {
    version: ACTIVITY_SCHEMA_VERSION,
    writing: {},
    tokens: {},
    tokenEntryIds: []
  }
}

function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function finiteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0
}

/**
 * 项目活动台账。所有写入按项目串行，避免文字与 Token 同时刷新时互相覆盖。
 */
export class ActivityLedgerService {
  private queues = new Map<string, Promise<unknown>>()

  private filePath(projectDir: string): string {
    return path.join(projectDir, ACTIVITY_FILE)
  }

  private async read(projectDir: string): Promise<ActivityLedgerFile> {
    let raw: Partial<ActivityLedgerFile> | null = null
    try {
      raw = await readJsonFile<Partial<ActivityLedgerFile>>(this.filePath(projectDir))
    } catch (error) {
      console.warn('[activity] 读取活动台账失败，将重新建立', error)
    }
    if (!raw) return emptyLedger()

    const writing: ActivityLedgerFile['writing'] = {}
    for (const [date, value] of Object.entries(raw.writing ?? {})) {
      if (!value || typeof value !== 'object') continue
      writing[date] = {
        beatWords: finiteNonNegative(value.beatWords),
        entityWords: finiteNonNegative(value.entityWords),
        articleWords: finiteNonNegative(value.articleWords)
      }
    }

    const tokens: Record<string, number> = {}
    for (const [date, value] of Object.entries(raw.tokens ?? {})) {
      tokens[date] = finiteNonNegative(value)
    }

    return {
      version: ACTIVITY_SCHEMA_VERSION,
      writing,
      tokens,
      tokenEntryIds: Array.isArray(raw.tokenEntryIds)
        ? raw.tokenEntryIds.filter((id): id is string => typeof id === 'string')
        : []
    }
  }

  private enqueue<T>(projectDir: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(projectDir) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(task)
    const queued = next.finally(() => {
      if (this.queues.get(projectDir) === queued) this.queues.delete(projectDir)
    })
    this.queues.set(projectDir, queued)
    return next
  }

  /** 今天始终覆盖为实时值；过去日期首次写入后永久冻结。 */
  captureWriting(
    projectDir: string,
    liveDays: WritingActivityDay[]
  ): Promise<WritingActivityDay[]> {
    return this.enqueue(projectDir, async () => {
      const ledger = await this.read(projectDir)
      const today = localDateKey(new Date())

      for (const day of liveDays) {
        if (day.date > today) continue
        if (day.date < today && ledger.writing[day.date]) continue
        ledger.writing[day.date] = {
          beatWords: finiteNonNegative(day.beatWords),
          entityWords: finiteNonNegative(day.entityWords),
          articleWords: finiteNonNegative(day.articleWords)
        }
      }

      // 今天没有任何现存文字时也要覆盖为 0，允许当天删除后回退。
      if (!liveDays.some((day) => day.date === today)) {
        ledger.writing[today] = { beatWords: 0, entityWords: 0, articleWords: 0 }
      }

      await writeJsonAtomic(this.filePath(projectDir), ledger)
      return this.writingDays(ledger)
    })
  }

  /** Token entry 只会记账一次，因此源会话删除后累计值也不会减少。 */
  captureTokens(
    projectDir: string,
    entries: TokenActivityEntry[]
  ): Promise<Array<{ date: string; tokens: number }>> {
    return this.enqueue(projectDir, async () => {
      const ledger = await this.read(projectDir)
      const seen = new Set(ledger.tokenEntryIds)
      for (const entry of entries) {
        if (seen.has(entry.id)) continue
        seen.add(entry.id)
        ledger.tokens[entry.date] =
          (ledger.tokens[entry.date] ?? 0) + finiteNonNegative(entry.tokens)
      }
      ledger.tokenEntryIds = [...seen]
      await writeJsonAtomic(this.filePath(projectDir), ledger)
      return this.tokenDays(ledger)
    })
  }

  async activity(projectDir: string): Promise<ProjectActivityDay[]> {
    const pending = this.queues.get(projectDir)
    if (pending) await pending.catch(() => undefined)
    const ledger = await this.read(projectDir)
    const dates = new Set([
      ...Object.keys(ledger.writing),
      ...Object.keys(ledger.tokens)
    ])
    return [...dates]
      .sort((a, b) => a.localeCompare(b))
      .map((date) => ({
        date,
        beatWords: ledger.writing[date]?.beatWords ?? 0,
        entityWords: ledger.writing[date]?.entityWords ?? 0,
        articleWords: ledger.writing[date]?.articleWords ?? 0,
        tokens: ledger.tokens[date] ?? 0
      }))
  }

  private writingDays(ledger: ActivityLedgerFile): WritingActivityDay[] {
    return Object.entries(ledger.writing)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, ...value }))
  }

  private tokenDays(
    ledger: ActivityLedgerFile
  ): Array<{ date: string; tokens: number }> {
    return Object.entries(ledger.tokens)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, tokens]) => ({ date, tokens }))
  }
}
