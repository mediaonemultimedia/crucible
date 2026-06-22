import { useCallback, useState } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { ImagePlus, Loader2, Play } from 'lucide-react'
import NodeShell from '../components/NodeShell'
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

      // Poll for completion
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
    <NodeShell label="Image Generation" icon={<ImagePlus size={14} />} color="#10b981" status={data.status} tips={tips.imageGen} width={300}>
      <Handle type="target" position={Position.Left} id="prompt_in" style={{ top: '35%' }} />
      <Handle type="target" position={Position.Left} id="image_in" style={{ top: '65%' }} />

      {/* Model */}
      <div className="flex gap-1 flex-wrap">
        {MODELS.map(m => (
          <button
            key={m.id}
            onClick={() => updateNodeData(id, { model: m.id })}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
              (data.model || 'flux-1.1-pro') === m.id
                ? 'border-emerald-400 bg-emerald-400/15 text-emerald-300'
                : 'border-nodeborder text-zinc-500 hover:border-zinc-400'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Prompt */}
      <textarea
        rows={3}
        placeholder="Prompt (or connect a Prompt Builder node)…"
        className="w-full bg-black/30 border border-nodeborder rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-emerald-500/50"
        value={data.prompt || ''}
        onChange={e => updateNodeData(id, { prompt: e.target.value })}
      />

      {/* Size */}
      <select
        className="w-full bg-black/30 border border-nodeborder rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500/50"
        value={data.size || '1024x1024'}
        onChange={e => updateNodeData(id, { size: e.target.value })}
      >
        {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[10px] text-zinc-500 cursor-pointer">
          <input
            type="checkbox"
            checked={data.enhancePrompt !== false}
            onChange={e => updateNodeData(id, { enhancePrompt: e.target.checked })}
            className="accent-emerald-400"
          />
          Enhance prompt with Claude
        </label>
      </div>

      <button
        onClick={generate}
        disabled={polling}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-xs font-medium hover:bg-emerald-600/30 transition-colors disabled:opacity-40"
      >
        {polling ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
        {polling ? 'Generating…' : 'Generate Image'}
      </button>

      {data.enhancedPrompt && (
        <p className="text-[10px] text-zinc-600 italic leading-relaxed">Enhanced: {data.enhancedPrompt}</p>
      )}

      {data.outputUrl && (
        <img src={data.outputUrl} alt="Generated" className="w-full rounded-lg object-cover" />
      )}

      <Handle type="source" position={Position.Right} id="image_out" style={{ top: '50%' }} />
    </NodeShell>
  )
}
