import { Link } from 'react-router'
import { ArrowRightLeft, CalendarClock, MessageCircle, MessageSquareText, Phone, Sparkles, StickyNote, UserCheck, Activity } from 'lucide-react'
import type { ActivityType } from '../../lib/types'
import { dateTime, relative } from '../../lib/format'
import { Empty } from '../../components/ui'
import type { FeedItem } from './api'

const ICON: Record<ActivityType, [typeof Phone, string]> = {
  created: [Sparkles, 'bg-blue-100 text-blue-700'],
  enquiry: [MessageSquareText, 'bg-violet-100 text-violet-700'],
  call: [Phone, 'bg-emerald-100 text-emerald-700'],
  whatsapp: [MessageCircle, 'bg-green-100 text-green-700'],
  note: [StickyNote, 'bg-amber-100 text-amber-700'],
  status_change: [ArrowRightLeft, 'bg-sky-100 text-sky-700'],
  assignment: [UserCheck, 'bg-slate-100 text-slate-600'],
  follow_up: [CalendarClock, 'bg-indigo-100 text-indigo-700'],
}

export function ActivityTimeline({ items, showLead }: { items: FeedItem[]; showLead?: boolean }) {
  if (!items.length) return <Empty icon={Activity}>No activity yet.</Empty>
  return (
    <ol className="relative space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-gradient-to-b before:from-slate-200 before:to-transparent">
      {items.map(a => {
        const [Icon, color] = ICON[a.type]
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${color}`}>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-sm text-slate-800">
                {showLead && <><Link to={`/leads/${a.lead_id}`} className="font-semibold text-slate-900 hover:text-blue-700">{a.lead.name}</Link>{': '}</>}
                {a.body}
              </p>
              <p className="mt-0.5 text-xs text-slate-500" title={dateTime(a.created_at)}>
                <span className="font-medium text-slate-600">{a.actor ?? 'System'}</span>, {relative(a.created_at)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
