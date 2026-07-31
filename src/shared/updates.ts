export type UpdatePhase =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateStatus {
  phase: UpdatePhase
  enabled: boolean
  currentVersion: string
  latestVersion: string | null
  releaseName: string | null
  releaseDate: string | null
  releaseNotes: string | null
  releaseUrl: string
  message: string
  error: string | null
  downloadPercent: number | null
  transferred: number | null
  total: number | null
}
