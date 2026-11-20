import { useState, useEffect } from 'react'
import { Eye, EyeOff, Sparkles } from 'lucide-react'
import { Button, ErrorText, Field, inputCls, Modal } from '../../components/ui'
import { generateStrongPassword, useCreateSalesUser, useUpdateSalesUser, type SalesUserData } from './api'

export function SalesUserModal({
  open,
  onClose,
  initialData = null,
}: {
  open: boolean
  onClose: () => void
  initialData?: SalesUserData | null
}) {
  const isEditing = !!initialData
  const createMutation = useCreateSalesUser()
  const updateMutation = useUpdateSalesUser()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [active, setActive] = useState(true)
  const [forcePasswordChange, setForcePasswordChange] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (initialData) {
      setName(initialData.full_name)
      setEmail(initialData.email)
      setPhone(initialData.phone || '')
      setActive(initialData.active)
      setForcePasswordChange(initialData.force_password_change)
      setPassword('')
    } else {
      setName('')
      setEmail('')
      setPhone('')
      setPassword(generateStrongPassword())
      setActive(true)
      setForcePasswordChange(true)
    }
    setError('')
  }, [initialData, open])

  const handleGeneratePassword = () => {
    setPassword(generateStrongPassword())
    setShowPassword(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      if (isEditing && initialData) {
        await updateMutation.mutateAsync({
          id: initialData.id,
          name: name.trim(),
          phone: phone.trim(),
          active,
          ...(password ? { password } : {}),
          force_password_change: forcePasswordChange,
        })
      } else {
        if (!password || password.length < 8) {
          setError('Password must be at least 8 characters')
          return
        }
        await createMutation.mutateAsync({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          phone: phone.trim(),
          active,
          force_password_change: forcePasswordChange,
        })
      }
      onClose()
    } catch (err: any) {
      setError(err.message || 'Operation failed')
    }
  }

  const busy = createMutation.isPending || updateMutation.isPending

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? `Edit Sales User: ${initialData.full_name}` : 'Create New Sales User'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full Name *">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            required
            placeholder="e.g. Priya Sharma"
            className={inputCls}
          />
        </Field>

        <Field label="Email Address *">
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            type="email"
            required
            disabled={isEditing}
            placeholder="priya@luxerefy.com"
            className={`${inputCls} ${isEditing ? 'bg-slate-50 text-slate-500' : ''}`}
          />
          {isEditing && <span className="text-[11px] text-slate-400">Email cannot be changed after creation.</span>}
        </Field>

        <Field label="Phone (Optional)">
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            type="tel"
            placeholder="+91 98765 43210"
            className={inputCls}
          />
        </Field>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-600">
              {isEditing ? 'Reset Password (leave empty to keep current)' : 'Password *'}
            </span>
            <button
              type="button"
              onClick={handleGeneratePassword}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              <Sparkles className="size-3" /> Generate Strong
            </button>
          </div>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required={!isEditing}
              placeholder={isEditing ? '••••••••••••' : 'Minimum 8 characters'}
              className={`${inputCls} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(s => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <div className="pt-2 space-y-2 border-t border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={e => setActive(e.target.checked)}
              className="size-4 rounded accent-blue-600"
            />
            <span className="text-xs font-medium text-slate-700">Account Active (allowed to sign in)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={forcePasswordChange}
              onChange={e => setForcePasswordChange(e.target.checked)}
              className="size-4 rounded accent-blue-600"
            />
            <span className="text-xs font-medium text-slate-700">Force password change on first login</span>
          </label>
        </div>

        <ErrorText error={error} />

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Sales User'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
