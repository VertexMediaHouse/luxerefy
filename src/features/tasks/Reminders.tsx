import { Link } from 'react-router'
import { Bell } from 'lucide-react'
import { dateTime } from '../../lib/format'
import { isOverdue, useReminders } from './api'

/** Header bell: native popover, light-dismiss for free. */
export function Reminders() {
  const { data = [] } = useReminders()
  const hide = () => document.getElementById('reminders')?.hidePopover()
  return (
    <>
      <button type="button" popoverTarget="reminders" className="relative rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label={`Reminders (${data.length})`}>
        <Bell className="size-[18px]" />
        {data.length > 0 && <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-red-500 text-[0px] ring-2 ring-white">{data.length}</span>}
      </button>
      <div id="reminders" popover="auto" className="fixed inset-auto top-[4.5rem] right-4 m-0 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-0 shadow-pop ring-1 ring-slate-200/80">
        <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">Due today</p>
        {data.length ? (
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {data.map(t => (
              <li key={t.id}>
                <Link to={t.lead_id ? `/leads/${t.lead_id}` : '/tasks'} onClick={hide} className="block px-4 py-3 hover:bg-slate-50">
                  <span className="block truncate text-sm font-semibold text-slate-800">{t.title}</span>
                  <span className={`text-xs ${isOverdue(t) ? 'font-semibold text-red-600' : 'text-slate-500'}`}>{isOverdue(t) ? 'Overdue · ' : ''}{dateTime(t.due_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="px-4 py-8 text-center text-sm text-slate-500">You're all caught up.</p>}
        <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-400">Email reminders go out from the scheduled reminders job.</p>
      </div>
    </>
  )
}
