import { useState } from 'react'
import { Position, useReactFlow } from '@xyflow/react'
import { Sparkles, Loader2, Wand2 } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import NodeHandle from '../components/NodeHandle'
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
    <NodeShell id={id} label="Prompt Builder" icon={<Sparkles size={13} />} color="#f59e0b" status="idle" tips={tips.promptBuilder} width={300}>
      <NodeHandle type="target" position={Position.Left} id="context_in" style={{ top: '40%' }} />
      <NodeHandle type="target" position={Position.Left} id="camera_in" style={{ top: '60%' }} />

      {data.cameraPrompt && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ background: 'rgba(232,121,249,0.04)', border: '1px solid rgba(232,121,249,0.1)' }}>
          <span className="text-[8px] text-fuchsia-400/40 uppercase tracking-wider font-medium">Camera</span>
          <span className="text-[10px] text-fuchsia-300/50 truncate font-light">{data.cameraPrompt}</span>
        </div>
      )}

      <textarea
        rows={4}
        placeholder="Describe what you want... subject, action, camera, lighting, mood."
        className="glass-input w-full px-3 py-2.5 text-[11px] resize-none leading-relaxed"
        value={data.prompt || ''}
        onChange={e => updateNodeData(id, { prompt: e.target.value })}
      />

      <div className="space-y-1">
        <label className="text-[9px] t-tertiary uppercase tracking-wider font-medium">Negative Prompt</label>
        <input
          type="text"
          placeholder="blurry, flickering, watermark, low quality, distorted..."
          className="glass-input w-full px-3 py-2 text-[10px]"
          value={data.negativePrompt || ''}
          onChange={e => updateNodeData(id, { negativePrompt: e.target.value })}
        />
      </div>

      <button onClick={enhance} disabled={enhancing || !data.prompt}
        className="action-btn"
        style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.15)', color: 'rgba(245,158,11,0.7)' }}>
        {enhancing ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
        {enhancing ? 'Claude is enhancing...' : 'Enhance with Claude'}
      </button>

      {data.originalPrompt && data.originalPrompt !== data.prompt && (
        <button
          onClick={() => updateNodeData(id, { prompt: data.originalPrompt, originalPrompt: null })}
          className="text-[9px] t-tertiary hover:t-tertiary transition-colors font-light"
        >
          Revert to original
        </button>
      )}

      <NodeHandle type="source" position={Position.Right} id="prompt" style={{ top: '50%' }} />
    </NodeShell>
  )
}
