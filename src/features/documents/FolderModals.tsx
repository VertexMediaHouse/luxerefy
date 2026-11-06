import { useState, type FormEvent } from 'react'
import { FolderPlus } from 'lucide-react'
import { Button, ErrorText, Field, inputCls, Modal } from '../../components/ui'
import { useCreateFolder, useFolders } from './api'

const COLORS = [
  { key: 'blue', label: 'Blue', bg: 'bg-blue-500' },
  { key: 'purple', label: 'Purple', bg: 'bg-purple-500' },
  { key: 'rose', label: 'Red / Rose', bg: 'bg-rose-500' },
  { key: 'amber', label: 'Amber / Orange', bg: 'bg-amber-500' },
  { key: 'emerald', label: 'Green', bg: 'bg-emerald-500' },
  { key: 'slate', label: 'Slate / Gray', bg: 'bg-slate-500' },
]

export function CreateFolderModal({
  open,
  onClose,
  defaultParentId = null,
}: {
  open: boolean
  onClose: () => void
  defaultParentId?: string | null
}) {
  const { data: folders = [] } = useFolders()
  const createFolder = useCreateFolder()
  const [parentId, setParentId] = useState<string>(defaultParentId ?? '')
  const [color, setColor] = useState<string>('blue')

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const name = String(f.get('name') ?? '').trim()
    if (!name) return

    createFolder.mutate(
      {
        name,
        parent_id: parentId || null,
        color,
      },
      {
        onSuccess: () => {
          onClose()
        },
      },
    )
  }

  const rootFolders = folders.filter(f => !f.parent_id)

  return (
    <Modal open={open} onClose={onClose} title="New Folder">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Folder Name *">
          <div className="relative">
            <input
              name="name"
              required
              autoFocus
              className={inputCls}
              placeholder="e.g. Ashoka Buildcon, Client Documents, Floor Plans"
            />
          </div>
        </Field>

        <Field label="Parent Folder" hint="Choose where to place this folder">
          <select
            value={parentId}
            onChange={e => setParentId(e.target.value)}
            className={inputCls}
          >
            <option value="">(Root Level — Top Category)</option>
            {rootFolders.map(f => (
              <option key={f.id} value={f.id}>
                📁 {f.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Theme Color">
          <div className="flex items-center gap-3 pt-1">
            {COLORS.map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => setColor(c.key)}
                className={`flex size-8 items-center justify-center rounded-full transition-transform ${c.bg} ${
                  color === c.key ? 'scale-110 ring-2 ring-slate-900 ring-offset-2' : 'opacity-80 hover:opacity-100'
                }`}
                title={c.label}
              >
                {color === c.key && <span className="size-2 rounded-full bg-white" />}
              </button>
            ))}
          </div>
        </Field>

        <div className="flex items-center justify-end gap-3 pt-2">
          <ErrorText error={createFolder.error} />
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createFolder.isPending}>
            <FolderPlus className="size-4" /> Create Folder
          </Button>
        </div>
      </form>
    </Modal>
  )
}
