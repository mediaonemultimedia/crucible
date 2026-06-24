import { useState } from 'react'
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react'

export default function TipsPanel({ tips = [] }) {
  const [open, setOpen] = useState(false)
  const [tipIndex, setTipIndex] = useState(0)

  if (!tips.length) return null

  return (
    <div className="mt-2 rounded-xl border border-amber-500/15 bg-amber-500/[0.05] text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-amber-500/70 hover:text-amber-500/90 transition-colors"
      >
        <Lightbulb size={10} />
        <span className="font-medium text-[10px]">Tips</span>
        <span className="ml-auto opacity-50 text-[9px]">{tips.length}</span>
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{tips[tipIndex]}</p>
          {tips.length > 1 && (
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {tips.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setTipIndex(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                      i === tipIndex ? 'bg-amber-500/70 scale-125' : 'bg-amber-500/20'
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={() => setTipIndex(i => (i + 1) % tips.length)}
                className="ml-auto text-amber-500/50 hover:text-amber-500/80 text-[9px] transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
