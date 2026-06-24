import { useCallback, useState } from 'react'
import { Position, useReactFlow } from '@xyflow/react'
import { ArrowUpCircle, Loader2, Play } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import NodeHandle from '../components/NodeHandle'
import { tips } from '../tips/nodeTips'

const PROVIDERS = [
  { id: 'topaz',     label: 'Topaz Video',  desc: 'Best quality, aspect-ratio based' },
  { id: 'bytedance', label: 'ByteDance',    desc: 'Preset-based, supports 4K + fps boost' },
]

const RESOLUTIONS = {
  topaz:     ['1080p', '2160p'],
  bytedance: ['1080p', '2k', '4k'],
}

const PRESETS = [
  { id: 'common',       label: 'General' },
  { id: 'aigc',         label: 'AI Generated' },
  { id: 'short_series', label: 'Short Film' },
  { id: 'ugc',          label: 'UGC / Social' },
  { id: 'old_film',     label: 'Old Film Restore' },
]

const ASPECT_RATIOS = ['auto', '16:9', '9:16', '4:3', '1:1', '21:9']

export default function UpscaleNode({ id, data }) {
  const { updateNodeData } = useReactFlow()
  const [running, setRunning] = useState(false)

  const provider = data.provider || 'topaz'
  const resolution = data.resolution || '1080p'

  const generate = useCallback(async () => {
    const videoId = data.sourceVideoId || data.sourceFileId
    if (!videoId) return
    setRunning(true)
    updateNodeData(id, { status: 'running', outputUrl: null })
    try {
      const payload = {
        video_id: videoId,
        provider,
        resolution,
        ...(provider === 'bytedance' ? {
          preset: data.preset || 'common',
          width:  data.sourceWidth  || 1920,
          height: data.sourceHeight || 1080,
          fps:    data.fps || 24,
        } : {
          aspect_ratio: data.aspectRatio || 'auto',
        })
      }
      const r = await fetch('/generate/upscale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await r.json()
      const genId = json.id || json.generation_id
      let result = json
      if (genId && json.status !== 'completed') {
        while (true) {
          await new Promise(res => setTimeout(res, 4000))
          const sr = await fetch(`/generate/status/${genId}`)
          result = await sr.json()
          if (['completed','failed','error'].includes(result.status)) break
        }
      }
      updateNodeData(id, {
        status: result.status === 'completed' ? 'done' : 'error',
        outputUrl: result.output_url || result.url || null,
      })
    } catch {
      updateNodeData(id, { status: 'error' })
    } finally {
      setRunning(false)
    }
  }, [id, data, provider, resolution, updateNodeData])

  return (
    <NodeShell id={id} label="Upscale" icon={<ArrowUpCircle size={13} />} color="#38bdf8" status={data.status} tips={tips.upscale} width={290}>
      <NodeHandle type="target" position={Position.Left} id="video_in" style={{ top: '50%' }} />

      {/* Provider */}
      <div className="grid grid-cols-2 gap-1.5">
        {PROVIDERS.map(p => (
          <button key={p.id} onClick={() => updateNodeData(id, { provider: p.id, resolution: RESOLUTIONS[p.id][0] })}
            className="p-2.5 rounded-xl text-left transition-all duration-200"
            style={{
              background: provider === p.id ? 'rgba(56,189,248,0.06)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${provider === p.id ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.04)'}`,
              color: provider === p.id ? 'rgba(56,189,248,0.8)' : 'var(--text-tertiary)',
            }}>
            <div className="text-[10px] font-medium">{p.label}</div>
            <div className="text-[9px] opacity-50 leading-tight mt-0.5 font-light">{p.desc}</div>
          </button>
        ))}
      </div>

      {/* Resolution */}
      <div className="flex gap-1.5">
        {(RESOLUTIONS[provider] || []).map(r => (
          <button key={r} onClick={() => updateNodeData(id, { resolution: r })}
            className={`pill-btn flex-1 ${resolution === r ? 'active-sky' : ''}`}>
            {r.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ByteDance extras */}
      {provider === 'bytedance' && (
        <>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => updateNodeData(id, { preset: p.id })}
                className={`pill-btn ${(data.preset || 'common') === p.id ? 'active-sky' : ''}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-[9px] t-tertiary whitespace-nowrap font-medium">FPS output</span>
            {[24, 30, 60].map(f => (
              <button key={f} onClick={() => updateNodeData(id, { fps: f })}
                className={`pill-btn ${(data.fps || 24) === f ? 'active-sky' : ''}`}>
                {f}fps
              </button>
            ))}
          </div>
        </>
      )}

      {/* Topaz extras */}
      {provider === 'topaz' && (
        <div className="flex flex-wrap gap-1">
          {ASPECT_RATIOS.map(ar => (
            <button key={ar} onClick={() => updateNodeData(id, { aspectRatio: ar })}
              className={`pill-btn ${(data.aspectRatio || 'auto') === ar ? 'active-sky' : ''}`}>
              {ar}
            </button>
          ))}
        </div>
      )}

      {!data.sourceVideoId && !data.sourceFileId && (
        <p className="text-[9px] t-tertiary font-light">Connect a Video Input or Video Gen output.</p>
      )}

      <button onClick={generate} disabled={running || (!data.sourceVideoId && !data.sourceFileId)}
        className="action-btn"
        style={{ background: 'rgba(56,189,248,0.06)', borderColor: 'rgba(56,189,248,0.2)', color: 'rgba(56,189,248,0.8)' }}>
        {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
        {running ? 'Upscaling...' : `Upscale to ${resolution.toUpperCase()}`}
      </button>

      {data.outputUrl && (
        <video src={data.outputUrl} className="w-full rounded-xl" controls muted loop />
      )}

      <NodeHandle type="source" position={Position.Right} id="video_out" style={{ top: '50%' }} />
    </NodeShell>
  )
}
