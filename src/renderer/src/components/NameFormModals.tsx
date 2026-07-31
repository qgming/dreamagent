import { NamePromptDialog } from '@/components/ui/name-prompt-modal'
import { useProjectStore } from '@/stores/project-store'

/**
 * 挂载项目 / 节点 / 实体的单行名称表单（共用 NamePromptModal）
 */
export function NameFormModals(): React.JSX.Element {
  const projectForm = useProjectStore((s) => s.projectForm)
  const beatForm = useProjectStore((s) => s.beatForm)
  const entityForm = useProjectStore((s) => s.entityForm)
  const closeProjectFormModal = useProjectStore((s) => s.closeProjectFormModal)
  const closeBeatFormModal = useProjectStore((s) => s.closeBeatFormModal)
  const closeEntityFormModal = useProjectStore((s) => s.closeEntityFormModal)
  const createProject = useProjectStore((s) => s.createProject)
  const updateProjectMeta = useProjectStore((s) => s.updateProjectMeta)
  const createBeat = useProjectStore((s) => s.createBeat)
  const updateBeat = useProjectStore((s) => s.updateBeat)
  const createEntity = useProjectStore((s) => s.createEntity)
  const updateEntity = useProjectStore((s) => s.updateEntity)

  const projectOpen = projectForm !== null
  const projectIsEdit = projectForm?.mode === 'edit'
  const beatOpen = beatForm !== null
  const beatIsEdit = beatForm?.mode === 'edit'
  const entityOpen = entityForm !== null
  const entityIsEdit = entityForm?.mode === 'edit'

  return (
    <>
      <NamePromptDialog
        confirmLabel={projectIsEdit ? '保存' : '创建'}
        initialValue={projectIsEdit && projectForm.mode === 'edit' ? projectForm.title : ''}
        label="项目名称"
        onOpenChange={(open) => {
          if (!open) closeProjectFormModal()
        }}
        onSubmit={async (title) => {
          if (!projectForm) return
          if (projectForm.mode === 'create') {
            await createProject({ title })
          } else {
            await updateProjectMeta(projectForm.projectId, { title })
            closeProjectFormModal()
          }
        }}
        open={projectOpen}
        placeholder="例如：噬灵魔藤开局"
        submittingLabel={projectIsEdit ? '保存中…' : '创建中…'}
        title={projectIsEdit ? '编辑项目' : '新建项目'}
      />

      <NamePromptDialog
        confirmLabel={beatIsEdit ? '保存' : '创建'}
        initialValue={beatIsEdit && beatForm.mode === 'edit' ? beatForm.title : ''}
        label="节点名称"
        onOpenChange={(open) => {
          if (!open) closeBeatFormModal()
        }}
        onSubmit={async (title) => {
          if (!beatForm) return
          if (beatForm.mode === 'create') {
            await createBeat({ title, parentId: beatForm.parentId ?? null })
          } else {
            await updateBeat(beatForm.beatId, { title })
          }
        }}
        open={beatOpen}
        placeholder="例如：血契认主"
        submittingLabel={beatIsEdit ? '保存中…' : '创建中…'}
        title={
          beatIsEdit
            ? '编辑节点'
            : beatForm?.mode === 'create' && beatForm.parentId
              ? '新建子节点'
              : '新建节点'
        }
      />

      <NamePromptDialog
        confirmLabel={entityIsEdit ? '保存' : '创建'}
        initialValue={entityIsEdit && entityForm.mode === 'edit' ? entityForm.name : ''}
        label="实体名称"
        onOpenChange={(open) => {
          if (!open) closeEntityFormModal()
        }}
        onSubmit={async (name) => {
          if (!entityForm) return
          if (entityForm.mode === 'create') {
            await createEntity({ name, parentId: entityForm.parentId ?? null })
          } else {
            await updateEntity(entityForm.entityId, { name })
          }
        }}
        open={entityOpen}
        placeholder="例如：噬灵魔藤"
        submittingLabel={entityIsEdit ? '保存中…' : '创建中…'}
        title={
          entityIsEdit
            ? '编辑实体'
            : entityForm?.mode === 'create' && entityForm.parentId
              ? '新建子实体'
              : '新建实体'
        }
      />
    </>
  )
}
