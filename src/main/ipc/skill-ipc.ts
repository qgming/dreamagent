import { ipcMain } from 'electron'
import type {
  CreateSkillInput,
  WriteSkillFileInput
} from '../../shared/skills'
import type { SkillService } from '../services/skill/skill-service'

function handle<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[skill-ipc]', message)
    throw new Error(message)
  })
}

/**
 * 技能 IPC：列表 / 详情 / 启用 / 导入 / 卸载 / 新建 / 读写文件
 */
export function registerSkillIpc(skills: SkillService): void {
  ipcMain.handle('skills:list', () => handle(() => skills.listSkills()))

  ipcMain.handle('skills:getDetail', (_e, id: string) =>
    handle(() => skills.getDetail(String(id || '')))
  )

  ipcMain.handle('skills:setEnabled', (_e, id: string, enabled: boolean) =>
    handle(() => skills.setEnabled(String(id || ''), Boolean(enabled)))
  )

  ipcMain.handle('skills:importZip', () =>
    handle(async () => {
      const result = await skills.importZipFromDialog()
      return result
    })
  )

  ipcMain.handle('skills:uninstall', (_e, id: string) =>
    handle(() => skills.uninstall(String(id || '')))
  )

  ipcMain.handle('skills:reload', () => handle(() => skills.reload()))

  ipcMain.handle('skills:create', (_e, input: CreateSkillInput) =>
    handle(() => skills.createSkill(input ?? { name: '', description: '' }))
  )

  ipcMain.handle('skills:writeFile', (_e, input: WriteSkillFileInput) =>
    handle(() =>
      skills.writeSkillFile(
        input ?? { id: '', relativePath: 'SKILL.md', content: '' }
      )
    )
  )

  ipcMain.handle(
    'skills:readFile',
    (_e, id: string, relativePath: string) =>
      handle(() =>
        skills.readSkillFileContent(String(id || ''), String(relativePath || 'SKILL.md'))
      )
  )
}
