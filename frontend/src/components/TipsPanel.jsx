import { useState } from 'react'
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react'

export default function TipsPanel({ tips = [] }) {
  const [open, setOpen] = useState(false)
  const [tipIndex, setTipIndex] = useState(0)

  if (!tips.length) return null

  return (
    <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-amber-400/80 hover:text-amber-300 transition-colors"
      >
        <Lightbulb size={11} />
        <span className="font-medium">Best Practice Tips</span>
        <span className="ml-auto opacity-50 text-[10px]">{tips.length} tips</span>
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 space-y-2">
          <p className="text-amber-200/70 leading-relaxed">{tips[tipIndex]}</p>
          {tips.length > 1 && (
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {tips.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setTipIndex(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      i === tipIndex ? 'bg-amber-400' : 'bg-amber-400/25'
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={() => setTipIndex(i => (i + 1) % tips.length)}
                className="ml-auto text-amber-400/50 hover:text-amber-400 text-[10px]"
              >
                Next tip →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
