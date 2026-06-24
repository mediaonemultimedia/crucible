import { useCallback, useState } from 'react'
import { Position, useReactFlow } from '@xyflow/react'
import { Clapperboard, Loader2, Play } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import NodeHandle from '../components/NodeHandle'
import { tips } from '../tips/nodeTips'

const MODELS = [
  { id: 'seedance-1-pro', label: 'Seedance 1 Pro', desc: 'Realistic motion' },
  { id: 'kling-3.0', label: 'Kling 3.0', desc: 'Stylized / fantasy' },
  { id: 'veo-3.1', label: 'Veo 3.1', desc: 'Google cinematic' },
  { id: 'wan-2.7', label: 'Wan 2.7', desc: 'Fast & flexible' },
]

export default function VideoGenNode({ id, data }) {
  const { updateNodeData } = useReactFlow()
  const [polling, setPolling] = useState(false)

  const generate = useCallback(async () => {
    updateNodeData(id, { status: 'running', outputUrl: null })
    setPolling(true)
    try {
      const r = await fetch('/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: data.prompt || '',
          negative_prompt: data.negativePrompt || 'blurry, flickering, morphing, watermark, distorted limbs, low quality',
          image_url: data.imageUrl || null,
          video_url: data.videoUrl || null,
          duration: data.duration || 5,
          model: data.model || 'seedance-1-pro',
          character_id: data.characterId || null,
          enhance_prompt: data.enhancePrompt !== false,
          node_context: { model: data.model, has_image: !!data.imageUrl, has_video: !!data.videoUrl },
        })
      })
      const json = await r.json()
      const genId = json.id || json.generation_id

      let result = json
      if (genId && json.status !== 'completed') {
        while (true) {
          await new Promise(res => setTimeout(res, 3000))
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
    <NodeShell id={id} label="Video Generation" icon={<Clapperboard size={13} />} color="#f97316" status={data.status} tips={tips.videoGen} width={310}>
      <NodeHandle type="target" position={Position.Left} id="prompt_in" style={{ top: '25%' }} />
      <NodeHandle type="target" position={Position.Left} id="image_in" style={{ top: '50%' }} />
      <NodeHandle type="target" position={Position.Left} id="video_in" style={{ top: '75%' }} />

      {/* Model selector */}
      <div className="grid grid-cols-2 gap-1.5">
        {MODELS.map(m => (
          <button
            key={m.id}
            onClick={() => updateNodeData(id, { model: m.id })}
            className="text-left px-3 py-2 rounded-xl transition-all duration-200"
            style={{
              background: (data.model || 'seedance-1-pro') === m.id ? 'rgba(249,115,22,0.08)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${(data.model || 'seedance-1-pro') === m.id ? 'rgba(249,115,22,0.25)' : 'rgba(255,255,255,0.04)'}`,
              color: (data.model || 'seedance-1-pro') === m.id ? 'rgba(249,115,22,0.8)' : 'var(--text-tertiary)',
            }}
          >
            <div className="text-[10px] font-medium">{m.label}</div>
            <div className="text-[9px] opacity-50 font-light">{m.desc}</div>
          </button>
        ))}
      </div>

      <textarea
        rows={3}
        placeholder="Describe the video... subject, action, camera motion, lighting, mood."
        className="glass-input w-full px-3 py-2.5 text-[11px] resize-none leading-relaxed"
        value={data.prompt || ''}
        onChange={e => updateNodeData(id, { prompt: e.target.value })}
      />

      <input
        type="text"
        placeholder="Negative prompt (flickering, blur, watermark...)"
        className="glass-input w-full px-3 py-2 text-[10px]"
        value={data.negativePrompt || ''}
        onChange={e => updateNodeData(id, { negativePrompt: e.target.value })}
      />

      {/* Duration */}
      <div className="flex items-center gap-3">
        <label className="text-[9px] t-secondary whitespace-nowrap font-medium">{data.duration || 5}s</label>
        <input
          type="range" min={3} max={15} step={1}
          value={data.duration || 5}
          onChange={e => updateNodeData(id, { duration: Number(e.target.value) })}
          className="flex-1 accent-orange-400"
        />
      </div>

      <label className="flex items-center gap-2 text-[10px] t-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={data.enhancePrompt !== false}
          onChange={e => updateNodeData(id, { enhancePrompt: e.target.checked })}
          className="accent-orange-400 rounded"
        />
        <span className="font-light">Enhance prompt with Claude</span>
      </label>

      <button onClick={generate} disabled={polling}
        className="action-btn"
        style={{ background: 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.2)', color: 'rgba(249,115,22,0.8)' }}>
        {polling ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
        {polling ? 'Generating video...' : 'Generate Video'}
      </button>

      {data.enhancedPrompt && (
        <p className="text-[9px] t-tertiary italic leading-relaxed font-light line-clamp-2">Enhanced: {data.enhancedPrompt}</p>
      )}

      {data.outputUrl && (
        <video src={data.outputUrl} className="w-full rounded-xl" controls muted loop />
      )}

      <NodeHandle type="source" position={Position.Right} id="video_out" style={{ top: '50%' }} />
    </NodeShell>
  )
}
