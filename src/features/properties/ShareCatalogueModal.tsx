import { useState } from 'react'
import { Check, Copy, ExternalLink, MessageSquare } from 'lucide-react'
import { Button, Modal } from '../../components/ui'
import { shareUrl } from './api'
import type { Property } from '../../lib/types'

interface ShareCatalogueModalProps {
  open: boolean
  onClose: () => void
  properties: Property[]
}

export function ShareCatalogueModal({ open, onClose, properties }: ShareCatalogueModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(properties.filter(p => p.is_public).map(p => p.id)))
  const [copied, setCopied] = useState(false)

  const publicProperties = properties.filter(p => p.is_public)

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(publicProperties.map(p => p.id)))
  const deselectAll = () => setSelectedIds(new Set())

  const selectedList = publicProperties.filter(p => selectedIds.has(p.id))

  const shareText = selectedList
    .map(p => `• *${p.title}* (${p.config}, ${p.locality})\n  Price: ₹${(p.price / 1e7).toFixed(2)} Cr\n  Link: ${shareUrl(p.slug)}`)
    .join('\n\n')

  const copyCatalogue = async () => {
    const message = `*Luxerefy Curated Properties:*\n\n${shareText}\n\nContact us for site visits and exclusive pricing.`
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('Copy catalogue message:', message)
    }
  }

  const shareWhatsApp = () => {
    const message = `*Luxerefy Curated Properties:*\n\n${shareText}\n\nContact us for site visits and exclusive pricing.`
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank')
  }

  return (
    <Modal open={open} onClose={onClose} title="Share property portfolio with client" wide>
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Select public listings to compile into a shareable portfolio message formatted with direct client preview links.
        </p>

        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-700">
            {selectedIds.size} of {publicProperties.length} listings selected
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={selectAll} className="text-blue-700 hover:underline">Select all</button>
            <span className="text-slate-300">|</span>
            <button type="button" onClick={deselectAll} className="text-slate-500 hover:underline">Clear all</button>
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
          {publicProperties.map(p => {
            const isChecked = selectedIds.has(p.id)
            return (
              <label key={p.id} className="flex cursor-pointer items-center justify-between p-2.5 hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(p.id)}
                    className="size-4 accent-blue-600 rounded"
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{p.title}</p>
                    <p className="text-[11px] text-slate-500">{p.locality} · {p.config} · ₹{(p.price / 1e7).toFixed(2)} Cr</p>
                  </div>
                </div>
                <a
                  href={`/p/${p.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="p-1 text-slate-400 hover:text-slate-700"
                  title="Preview"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </label>
            )
          })}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button
            variant="secondary"
            disabled={selectedList.length === 0}
            onClick={shareWhatsApp}
          >
            <MessageSquare className="size-4 text-emerald-600" /> WhatsApp
          </Button>
          <Button
            disabled={selectedList.length === 0}
            onClick={copyCatalogue}
          >
            {copied ? <Check className="size-4 text-emerald-300" /> : <Copy className="size-4" />}
            {copied ? 'Copied to clipboard' : `Copy ${selectedList.length} links`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
