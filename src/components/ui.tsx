import { useEffect, useRef, type ButtonHTMLAttributes, type ComponentType, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Loader2, Plus, Search, X } from 'lucide-react'
import type { Tone } from '../lib/labels'
import { stageKind, stageLabel, stageProgress, stageTone } from '../lib/stages'
import type { LeadStatus } from '../lib/types'
import { initials } from '../lib/format'

const BTN = {
  primary: 'bg-slate-900 text-white shadow-soft hover:bg-slate-700',
  secondary: 'bg-white text-slate-700 shadow-soft ring-1 ring-slate-200/80 hover:bg-slate-50 hover:text-slate-900',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-white text-red-600 ring-1 ring-slate-200 hover:bg-red-50 hover:ring-red-200',
}
export type ButtonVariant = keyof typeof BTN

export const buttonCls = (v: ButtonVariant = 'primary') =>
  `inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${BTN[v]}`

export function Button({ variant = 'primary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type="button" {...p} className={`${buttonCls(variant)} ${className}`} />
}

/** White pill control for toolbars (filters, view switch, selects). */
export const pillCls = 'inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-soft ring-1 ring-slate-200/80 hover:bg-slate-50'

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`min-w-0 rounded-2xl bg-white shadow-card ring-1 ring-slate-200/70 ${className}`}>{children}</div>
}

export function CardHeader({ title, subtitle, action, icon: Icon }: { title: string; subtitle?: ReactNode; action?: ReactNode; icon?: ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon className="size-4 shrink-0 text-slate-400" />}
        <h2 className="text-sm font-medium text-slate-900">{title}</h2>
        {subtitle && <span className="truncate text-xs text-slate-400">{subtitle}</span>}
      </div>
      {action}
    </div>
  )
}

/** Quiet text action for card headers. */
export function HeaderLink({ to, onClick, children }: { to?: string; onClick?: () => void; children: ReactNode }) {
  const cls = 'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900'
  return to
    ? <Link to={to} className={cls}>{children}<ChevronRight className="size-3.5" /></Link>
    : <button type="button" onClick={onClick} className={cls}><Plus className="size-3.5" />{children}</button>
}

const TONE: Record<Tone, [string, string]> = {
  slate: ['bg-slate-100', 'bg-slate-400'],
  blue: ['bg-sky-50', 'bg-sky-500'],
  violet: ['bg-violet-50', 'bg-violet-500'],
  amber: ['bg-amber-50', 'bg-amber-500'],
  green: ['bg-emerald-50', 'bg-emerald-500'],
  red: ['bg-red-50', 'bg-red-500'],
}
export const toneDot = (t: Tone) => TONE[t][1]

/** Soft grey-ish chip; the coloured dot carries the meaning. */
export function Badge({ tone = 'slate', children, dot = true }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-700 ${TONE[tone][0]}`}>
      {dot && <span className={`size-1.5 rounded-full ${TONE[tone][1]}`} />}
      {children}
    </span>
  )
}

/** The ring fill and colour come from the stage row now, so a custom stage draws itself. */
export const TONE_HEX: Record<Tone, string> = {
  slate: '#94a3b8', blue: '#0ea5e9', violet: '#8b5cf6', amber: '#f59e0b', green: '#10b981', red: '#ef4444',
}
export function StageIcon({ status, className = 'size-3.5' }: { status: LeadStatus; className?: string }) {
  const kind = stageKind(status)
  const done = kind === 'won' || kind === 'lost'
  const frac = stageProgress(status)
  const color = TONE_HEX[stageTone(status)]
  const c = 2 * Math.PI * 3
  return (
    <svg viewBox="0 0 14 14" className={`shrink-0 ${className}`} aria-hidden>
      {done ? <>
        <circle cx="7" cy="7" r="6.5" fill={color} />
        {kind === 'won'
          ? <path d="M4.3 7.2 6.1 9l3.6-3.8" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          : <path d="M5 5l4 4M9 5 5 9" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />}
      </> : <>
        <circle cx="7" cy="7" r="6" fill="none" stroke={color} strokeWidth="1.3" strokeDasharray={frac ? undefined : '2 1.6'} />
        {frac > 0 && <circle cx="7" cy="7" r="3" fill="none" stroke={color} strokeWidth="6" strokeDasharray={`${frac * c} ${c}`} transform="rotate(-90 7 7)" />}
      </>}
    </svg>
  )
}
export function StageChip({ status }: { status: LeadStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
      <StageIcon status={status} /> {stageLabel(status)}
    </span>
  )
}

const AVATAR = ['bg-orange-100 text-orange-800', 'bg-sky-100 text-sky-800', 'bg-emerald-100 text-emerald-800', 'bg-violet-100 text-violet-800', 'bg-rose-100 text-rose-800', 'bg-amber-100 text-amber-900']
export function Avatar({ name, size = 'md' }: { name: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' }) {
  const color = AVATAR[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR.length]
  const dim = { xs: 'size-6 text-[10px]', sm: 'size-7 text-[11px]', md: 'size-8 text-xs', lg: 'size-12 text-base', xl: 'size-16 text-xl' }[size]
  return <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white ${dim} ${color}`}>{initials(name)}</span>
}
export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  return (
    <span className="flex -space-x-1.5" title={names.join(', ')}>
      {names.slice(0, max).map(n => <Avatar key={n} name={n} size="xs" />)}
      {names.length > max && <span className="inline-flex size-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 ring-2 ring-white">+{names.length - max}</span>}
    </span>
  )
}

export const inputCls =
  'block w-full rounded-lg border-0 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-soft ring-1 ring-slate-200/80 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none'
/** Same look, natural width: toolbar filters and inline selects. */
export const inlineInputCls = inputCls.replace('w-full', 'w-auto')

export function SearchBox({ value, onChange, placeholder, label, className = '' }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; className?: string }) {
  return (
    <label className={`relative ${className}`}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} pl-8`} aria-label={label} />
    </label>
  )
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (open && !d?.open) d?.showModal()
    if (!open && d?.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={e => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-2xl bg-white p-0 shadow-pop ring-1 ring-slate-200 backdrop:bg-black/25`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <X className="size-4" />
        </button>
      </div>
      <div className="p-5">{open && children}</div>
    </dialog>
  )
}

export function PageHeader({ title, subtitle, actions, back, icon: I, tint = 'text-slate-600', tag }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string }; icon?: ComponentType<{ className?: string }>; tint?: string; tag?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link to={back.to} className="mb-1.5 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
            {back.label} <ChevronRight className="size-3.5" />
          </Link>
        )}
        <div className="flex items-center gap-3">
          {I && <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-card ring-1 ring-slate-200/70"><I className={`size-[18px] ${tint}`} /></span>}
          <h1 className="truncate text-2xl leading-tight font-semibold tracking-tight text-slate-900">{title}</h1>
          {tag}
        </div>
        {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** Filter strip at the top of a list: underline tabs flush with the bottom rule, search/filters on the right. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col-reverse gap-2 border-b border-slate-200 px-4 pt-3 lg:flex-row lg:items-end lg:justify-between lg:pt-0 lg:[&>:last-child]:py-2.5">{children}</div>
}

export function RecordCount({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  return <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">{shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`}</p>
}

/** Shared list-view table classes. */
export const T = {
  table: 'w-full text-sm',
  head: 'border-b border-slate-100 text-left text-xs text-slate-500',
  th: 'px-3 py-2.5 whitespace-nowrap font-medium first:pl-4 last:pr-4',
  body: 'divide-y divide-slate-100',
  row: 'cursor-pointer transition-colors hover:bg-slate-50',
  td: 'px-3 py-2.5 first:pl-4 last:pr-4',
}

export function Empty({ icon: Icon, children }: { icon: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-12 text-center text-sm text-slate-500">
      <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><Icon className="size-5" /></span>
      {children}
    </div>
  )
}

export function Loading() {
  return (
    <div className="flex justify-center py-24 text-slate-400">
      <Loader2 className="size-6 animate-spin" aria-label="Loading" />
    </div>
  )
}

export function ErrorText({ error }: { error: unknown }) {
  return error ? <p role="alert" className="text-sm font-medium text-red-600">{error instanceof Error ? error.message : String(error)}</p> : null
}

/** Underline view tabs with counts; sit them on a bottom border (Toolbar, or a border-b wrapper). */
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number; icon?: ComponentType<{ className?: string }> }[] }) {
  return (
    <div className="-mb-px flex gap-5 overflow-x-auto">
      {items.map(({ value: v, label, count, icon: I }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 pt-1 pb-2.5 text-sm transition-colors ${value === v ? 'border-blue-600 font-medium text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          {I && <I className="size-4" />}
          {label}
          {count != null && <span className="rounded bg-slate-100 px-1.5 text-[11px] leading-4 text-slate-500">{count}</span>}
        </button>
      ))}
    </div>
  )
}
