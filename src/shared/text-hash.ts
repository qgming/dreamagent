/**
 * 正文哈希工具（FNV-1a），用于 edit 工具的 expectedSourceHash 版本校验。
 */

function sourceHash(text: string): string {
  let hash = 2166136261
  const bytes = new TextEncoder().encode(text)
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** FNV-1a 32 位哈希，用于正文版本校验（expectedSourceHash）。 */
export function hashText(text: string): string {
  return sourceHash(text)
}
