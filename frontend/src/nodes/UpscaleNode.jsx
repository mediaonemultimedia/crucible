import { useCallback, useState } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { ArrowUpCircle, Loader2, Play } from 'lucide-react'
import NodeShell from '../components/NodeShell'
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
    <NodeShell label="Upscale" icon={<ArrowUpCircle size={14} />} color="#38bdf8" status={data.status} tips={tips.upscale} width={290}>
      <Handle type="target" position={Position.Left} id="video_in" style={{ top: '50%' }} />

      {/* Provider */}
      <div className="grid grid-cols-2 gap-1.5">
        {PROVIDERS.map(p => (
          <button key={p.id} onClick={() => updateNodeData(id, { provider: p.id, resolution: RESOLUTIONS[p.id][0] })}
            className={`p-2 rounded-lg border text-left transition-colors ${provider === p.id ? 'border-sky-400 bg-sky-400/12 text-sky-200' : 'border-nodeborder text-zinc-500 hover:border-zinc-400'}`}>
            <div className="text-[10px] font-medium">{p.label}</div>
            <div className="text-[9px] opacity-60 leading-tight mt-0.5">{p.desc}</div>
          </button>
        ))}
      </div>

      {/* Resolution */}
      <div className="flex gap-1.5">
        {(RESOLUTIONS[provider] || []).map(r => (
          <button key={r} onClick={() => updateNodeData(id, { resolution: r })}
            className={`flex-1 text-[10px] py-1 rounded-md border transition-colors ${resolution === r ? 'border-sky-400 bg-sky-400/12 text-sky-300' : 'border-nodeborder text-zinc-500 hover:border-zinc-400'}`}>
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
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${(data.preset || 'common') === p.id ? 'border-sky-400 bg-sky-400/12 text-sky-300' : 'border-nodeborder text-zinc-500'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-[10px] text-zinc-500 whitespace-nowrap">FPS output</span>
            {[24, 30, 60].map(f => (
              <button key={f} onClick={() => updateNodeData(id, { fps: f })}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${(data.fps || 24) === f ? 'border-sky-400 text-sky-300' : 'border-nodeborder text-zinc-500'}`}>
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
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${(data.aspectRatio || 'auto') === ar ? 'border-sky-400 bg-sky-400/12 text-sky-300' : 'border-nodeborder text-zinc-500'}`}>
              {ar}
            </button>
          ))}
        </div>
      )}

      {!data.sourceVideoId && !data.sourceFileId && (
        <p className="text-[10px] text-zinc-600">Connect a Video Input or Video Gen output.</p>
      )}

      <button onClick={generate} disabled={running || (!data.sourceVideoId && !data.sourceFileId)}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-sky-600/15 border border-sky-500/30 text-sky-300 text-xs font-medium hover:bg-sky-600/25 transition-colors disabled:opacity-40">
        {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
        {running ? 'Upscaling…' : `Upscale to ${resolution.toUpperCase()}`}
      </button>

      {data.outputUrl && (
        <video src={data.outputUrl} className="w-full rounded-lg" controls muted loop />
      )}

      <Handle type="source" position={Position.Right} id="video_out" style={{ top: '50%' }} />
    </NodeShell>
  )
}
