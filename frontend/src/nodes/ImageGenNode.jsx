import { useCallback, useState } from 'react'
import { Position, useReactFlow } from '@xyflow/react'
import { ImagePlus, Loader2, Play } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import NodeHandle from '../components/NodeHandle'
import { tips } from '../tips/nodeTips'

const MODELS = [
  { id: 'flux-1.1-pro', label: 'Flux 1.1 Pro' },
  { id: 'gpt-image-2', label: 'GPT Image 2' },
  { id: 'nano-banana-pro', label: 'Nano Banana Pro' },
]

const SIZES = ['1024x1024', '1280x720', '720x1280', '1024x576']

export default function ImageGenNode({ id, data }) {
  const { updateNodeData } = useReactFlow()
  const [polling, setPolling] = useState(false)

  const generate = useCallback(async () => {
    updateNodeData(id, { status: 'running', outputUrl: null })
    setPolling(true)
    try {
      const [w, h] = (data.size || '1024x1024').split('x').map(Number)
      const r = await fetch('/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: data.prompt || '',
          negative_prompt: data.negativePrompt || '',
          width: w, height: h,
          model: data.model || 'flux-1.1-pro',
          reference_image_url: data.referenceImageUrl || null,
          enhance_prompt: data.enhancePrompt !== false,
          node_context: { model: data.model, size: data.size },
        })
      })
      const json = await r.json()
      const genId = json.id || json.generation_id

      let result = json
      if (genId && json.status !== 'completed') {
        while (true) {
          await new Promise(res => setTimeout(res, 2500))
          const sr = await fetch(`/generate/status/${genId}`)
          result = await sr.json()
          if (result.status === 'completed' || result.status === 'failed') break
        }
      }

      updateNodeData(id, {
        status: result.status === 'completed' ? 'done' : 'error',
        outputUrl: result.output_url || result.url || null,
        enhancedPrompt: json.enhanced_prompt,
      })
    } catch {
      updateNodeData(id, { status: 'error' })
    } finally {
      setPolling(false)
    }
  }, [id, data, updateNodeData])

  return (
    <NodeShell id={id} label="Image Generation" icon={<ImagePlus size={13} />} color="#10b981" status={data.status} tips={tips.imageGen} width={300}>
      <NodeHandle type="target" position={Position.Left} id="prompt_in" style={{ top: '35%' }} />
      <NodeHandle type="target" position={Position.Left} id="image_in" style={{ top: '65%' }} />

      <div className="flex gap-1 flex-wrap">
        {MODELS.map(m => (
          <button
            key={m.id}
            className={`pill-btn ${(data.model || 'flux-1.1-pro') === m.id ? 'active-emerald' : ''}`}
            onClick={() => updateNodeData(id, { model: m.id })}
          >
            {m.label}
          </button>
        ))}
      </div>

      <textarea
        rows={3}
        placeholder="Prompt (or connect a Prompt Builder node)..."
        className="glass-input w-full px-3 py-2.5 text-[11px] resize-none leading-relaxed"
        value={data.prompt || ''}
        onChange={e => updateNodeData(id, { prompt: e.target.value })}
      />

      <select
        className="glass-input w-full px-3 py-2 text-[10px] appearance-none cursor-pointer"
        value={data.size || '1024x1024'}
        onChange={e => updateNodeData(id, { size: e.target.value })}
      >
        {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      <label className="flex items-center gap-2 text-[10px] t-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={data.enhancePrompt !== false}
          onChange={e => updateNodeData(id, { enhancePrompt: e.target.checked })}
          className="accent-emerald-400 rounded"
        />
        <span className="font-light">Enhance prompt with Claude</span>
      </label>

      <button onClick={generate} disabled={polling}
        className="action-btn"
        style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.2)', color: 'rgba(16,185,129,0.8)' }}>
        {polling ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
        {polling ? 'Generating...' : 'Generate Image'}
      </button>

      {data.enhancedPrompt && (
        <p className="text-[9px] t-tertiary italic leading-relaxed font-light">Enhanced: {data.enhancedPrompt}</p>
      )}

      {data.outputUrl && (
        <img src={data.outputUrl} alt="Generated" className="w-full rounded-xl object-cover" />
      )}

      <NodeHandle type="source" position={Position.Right} id="image_out" style={{ top: '50%' }} />
    </NodeShell>
  )
}
