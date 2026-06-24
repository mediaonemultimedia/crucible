import { useReactFlow } from '@xyflow/react'
import { X } from 'lucide-react'
import TipsPanel from './TipsPanel'

const STATUS_STYLES = {
  idle:       '',
  running:    'animate-pulse',
  done:       '',
  error:      '',
}

const STATUS_COLORS = {
  running: { bg: 'rgba(110,142,251,0.12)', color: '#6e8efb' },
  done:    { bg: 'rgba(52,211,153,0.12)',  color: '#34d399' },
  error:   { bg: 'rgba(248,113,113,0.12)', color: '#f87171' },
}

export default function NodeShell({ id, label, icon, color = '#6e8efb', status = 'idle', tips = [], children, width = 280 }) {
  const { deleteElements } = useReactFlow()

  const onDelete = (e) => {
    e.stopPropagation()
    deleteElements({ nodes: [{ id }] })
  }

  const sc = STATUS_COLORS[status]

  return (
    <div
      className="node-glass rounded-2xl overflow-visible group"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        <span style={{ color }} className="text-sm">{icon}</span>
        <span className="text-[11px] font-semibold tracking-wide" style={{ color: 'var(--text-primary)' }}>{label}</span>
        {status !== 'idle' && sc && (
          <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[status]}`}
            style={{ background: sc.bg, color: sc.color }}>
            {status}
          </span>
        )}
        <button
          onClick={onDelete}
          className="ml-auto w-5 h-5 flex items-center justify-center rounded-full
                     opacity-0 group-hover:opacity-100
                     hover:bg-[var(--pill-hover-bg)]
                     transition-all duration-200"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <X size={10} strokeWidth={2.5} />
        </button>
      </div>

      {/* Divider */}
      <div className="h-px mx-3" style={{ background: 'var(--divider)' }} />

      {/* Body */}
      <div className="p-3.5 space-y-2.5">
        {children}
        <TipsPanel tips={tips} />
      </div>
    </div>
  )
}
