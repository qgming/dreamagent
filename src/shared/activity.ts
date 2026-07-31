/** 首页热力图中某个本地自然日的创作活动。 */
export interface WritingActivityDay {
  date: string
  beatWords: number
  entityWords: number
  articleWords: number
}

/** 首页两张热力图共用的持久化日统计。 */
export interface ProjectActivityDay extends WritingActivityDay {
  tokens: number
}
