// Shared wrapper for all node types — handles the chrome, header, status badge
import TipsPanel from './TipsPanel'

const STATUS_STYLES = {
  idle:       'bg-zinc-700/50 text-zinc-400',
  running:    'bg-accent/20 text-accent animate-pulse',
  done:       'bg-success/20 text-success',
  error:      'bg-danger/20 text-danger',
}

export default function NodeShell({ label, icon, color = '#7c6aff', status = 'idle', tips = [], children, width = 280 }) {
  return (
    <div
      className="rounded-xl border border-nodeborder bg-node shadow-xl shadow-black/40 overflow-hidden"
      style={{ width, borderTopColor: color, borderTopWidth: 2 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-nodeborder/60">
        <span style={{ color }} className="text-base">{icon}</span>
        <span className="text-[11px] font-semibold tracking-wide uppercase text-zinc-300">{label}</span>
        {status !== 'idle' && (
          <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_STYLES[status]}`}>
            {status}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        {children}
        <TipsPanel tips={tips} />
      </div>
    </div>
  )
}
