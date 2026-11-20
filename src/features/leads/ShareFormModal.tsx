import { useState } from 'react'
import { Check, Copy, Download, ExternalLink, Link2, MessageSquare, QrCode, ShieldCheck, Sparkles, UserPlus, Zap } from 'lucide-react'
import { Button, Modal } from '../../components/ui'

type ShareFormModalProps = {
  open: boolean
  onClose: () => void
}

const PERKS = [
  { icon: Zap, title: 'Instant capture', text: 'Every submission lands in Leads in real time.' },
  { icon: ShieldCheck, title: 'No duplicates', text: 'Repeat enquiries merge by phone number.' },
  { icon: UserPlus, title: 'Auto-assigned', text: 'New leads go straight to the pipeline.' },
]

export function ShareFormModal({ open, onClose }: ShareFormModalProps) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/sales-form`
  // ponytail: public QR image service, swap for a local QR lib if offline use matters
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=${encodeURIComponent(url)}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('Copy this link:', url)
    }
  }

  const [qrCopied, setQrCopied] = useState<'' | 'ok' | 'fail'>('')
  const copyQr = async () => {
    try {
      const blob = await (await fetch(qr)).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setQrCopied('ok')
    } catch {
      setQrCopied('fail')
    }
    setTimeout(() => setQrCopied(''), 2000)
  }

  const shareWhatsApp = () => {
    const text = `Hello! Please share your luxury property requirements with us here: ${url}`
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <Modal open={open} onClose={onClose} title="Share Public Lead Form" wide>
      <div className="space-y-5">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-5 text-white shadow-lg">
          <div className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 -left-6 size-32 rounded-full bg-indigo-400/20 blur-2xl" />

          <div className="relative grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
                <Sparkles className="size-3.5" /> Generated Dynamic Link
              </span>
              <h3 className="mt-2 text-lg font-bold tracking-tight">Collect enquiries from anywhere</h3>
              <p className="mt-1 text-sm text-blue-100">
                Send this link to prospects, post it on socials, or print the QR at site visits and expos.
              </p>

              <div className="mt-4 flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-white/95 px-3 py-2 font-mono text-xs text-slate-800 shadow-sm">
                  <Link2 className="size-4 shrink-0 text-blue-600" />
                  <span className="truncate">{url}</span>
                </div>
                <Button
                  type="button"
                  onClick={copyLink}
                  className={`shrink-0 ${copied ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-amber-400 font-semibold text-slate-900 hover:bg-amber-300'}`}
                >
                  {copied ? <><Check className="size-4" /> Copied!</> : <><Copy className="size-4" /> Copy Link</>}
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={shareWhatsApp}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600"
                >
                  <MessageSquare className="size-3.5" /> Share on WhatsApp
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/25"
                >
                  <ExternalLink className="size-3.5" /> Open Preview
                </a>
              </div>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="rounded-xl bg-white p-2 shadow-md">
                <img src={qr} alt="QR code for the lead form" className="size-32" />
              </div>
              <div className="flex items-center gap-3 text-[11px] font-medium text-blue-100">
                <button type="button" onClick={copyQr} className="inline-flex items-center gap-1 hover:text-white">
                  {qrCopied === 'ok' ? <><Check className="size-3.5" /> Copied!</>
                    : qrCopied === 'fail' ? <>Copy failed</>
                    : <><QrCode className="size-3.5" /> Copy QR</>}
                </button>
                <a
                  href={qr}
                  target="_blank"
                  rel="noreferrer"
                  download="luxerefy-lead-form-qr.png"
                  className="inline-flex items-center gap-1 hover:text-white"
                >
                  <Download className="size-3" /> Download
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {PERKS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Icon className="size-4" />
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">{title}</p>
              <p className="mt-0.5 text-xs text-slate-500">{text}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-[11px] text-slate-500">
          Submissions automatically deduplicate by phone number.
        </p>
      </div>
    </Modal>
  )
}
