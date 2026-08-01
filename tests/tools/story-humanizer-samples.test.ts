import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyzeText } from '../../src/shared/text-statistics'

const samplesDir = 'resources/skills/story-humanizer/references/human-style-samples'

describe('story-humanizer 内置人类样文回归', () => {
  it('5 篇样文在三种对话策略下均为自动结构满分', () => {
    const files = readdirSync(samplesDir).filter((file) => file.endsWith('.md')).sort()

    expect(files).toHaveLength(5)

    for (const dialogueExpectation of ['none', 'some', 'driving'] as const) {
      for (const file of files) {
        const text = readFileSync(`${samplesDir}/${file}`, 'utf8')
        const report = analyzeText(text, {
          profile: 'story-humanizer',
          dialogueExpectation,
          segmentCount: 5
        })

        expect(report.profile?.score, `${dialogueExpectation}:${file}`).toBe(100)
        expect(
          report.profile?.findings.filter((finding) => finding.severity !== 'info'),
          `${dialogueExpectation}:${file}`
        ).toEqual([])
      }
    }
  })
})
