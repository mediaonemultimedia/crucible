import { useState } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { Sparkles, Loader2, Wand2 } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import { tips } from '../tips/nodeTips'

export default function PromptBuilderNode({ id, data }) {
  const { updateNodeData } = useReactFlow()
  const [enhancing, setEnhancing] = useState(false)

  const enhance = async () => {
    if (!data.prompt) return
    setEnhancing(true)
    try {
      const r = await fetch('/analyze/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: data.prompt, node_type: 'prompt_builder', context: data.context || {} })
      })
      const json = await r.json()
      updateNodeData(id, { prompt: json.enhanced, originalPrompt: json.original })
    } finally {
      setEnhancing(false)
    }
  }

  return (
    <NodeShell label="Prompt Builder" icon={<Sparkles size={14} />} color="#f59e0b" status="idle" tips={tips.promptBuilder} width={300}>
      <Handle type="target" position={Position.Left} id="context_in" style={{ top: '40%' }} />
      <Handle type="target" position={Position.Left} id="camera_in" style={{ top: '60%' }} />
      {data.cameraPrompt && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-fuchsia-500/10 border border-fuchsia-500/20">
          <span className="text-[9px] text-fuchsia-400/70 uppercase tracking-wide">Camera</span>
          <span className="text-[10px] text-fuchsia-300/80 truncate">{data.cameraPrompt}</span>
        </div>
      )}

      <textarea
        rows={4}
        placeholder="Describe what you want… be specific about subject, action, camera, lighting, and mood."
        className="w-full bg-black/30 border border-nodeborder rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-accent/50 leading-relaxed"
        value={data.prompt || ''}
        onChange={e => updateNodeData(id, { prompt: e.target.value })}
      />

      <div className="space-y-1.5">
        <label className="text-[10px] text-zinc-500 uppercase tracking-wide">Negative Prompt</label>
        <input
          type="text"
          placeholder="blurry, flickering, watermark, low quality, distorted…"
          className="w-full bg-black/30 border border-nodeborder rounded-lg px-3 py-1.5 text-xs text-zinc-400 placeholder:text-zinc-600 focus:outline-none focus:border-danger/40"
          value={data.negativePrompt || ''}
          onChange={e => updateNodeData(id, { negativePrompt: e.target.value })}
        />
      </div>

      <button
        onClick={enhance}
        disabled={enhancing || !data.prompt}
        className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/25 transition-colors disabled:opacity-40"
      >
        {enhancing ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
        {enhancing ? 'Claude is enhancing…' : 'Enhance with Claude'}
      </button>

      {data.originalPrompt && data.originalPrompt !== data.prompt && (
        <button
          onClick={() => updateNodeData(id, { prompt: data.originalPrompt, originalPrompt: null })}
          className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          ↩ Revert to original
        </button>
      )}

      <Handle type="source" position={Position.Right} id="prompt" style={{ top: '50%' }} />
    </NodeShell>
  )
}
