import { useCallback, useState } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { Shuffle, Loader2, Play, Info } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import { tips } from '../tips/nodeTips'

export default function MotionTransferNode({ id, data }) {
  const { updateNodeData } = useReactFlow()
  const [running, setRunning] = useState(false)

  const resolution = data.resolution || '720p'
  const sceneControl = data.sceneControl || 'image'

  const generate = useCallback(async () => {
    if (!data.characterImageId || !data.motionVideoId) return
    setRunning(true)
    updateNodeData(id, { status: 'running', outputUrl: null })
    try {
      const r = await fetch('/generate/motion-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_id: data.characterImageId,
          motion_video_id: data.motionVideoId,
          resolution,
          scene_control: sceneControl,
        }),
      })
      const json = await r.json()
      const genId = json.id || json.generation_id
      let result = json
      if (genId && json.status !== 'completed') {
        while (true) {
          await new Promise(res => setTimeout(res, 3500))
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
  }, [id, data, resolution, sceneControl, updateNodeData])

  const hasChar  = !!data.characterImageId
  const hasMotion = !!data.motionVideoId

  return (
    <NodeShell label="Motion Transfer" icon={<Shuffle size={14} />} color="#a78bfa" status={data.status} tips={tips.motionTransfer} width={300}>

      {/* Input slots — visual indicators */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-lg border p-2.5 transition-colors ${hasChar ? 'border-violet-400/50 bg-violet-400/8' : 'border-nodeborder border-dashed'}`}>
          <p className="text-[9px] uppercase tracking-wide text-zinc-600 mb-1">← Character Image</p>
          {data.characterImageUrl
            ? <img src={data.characterImageUrl} className="w-full h-14 object-cover rounded" alt="character" />
            : <p className="text-[10px] text-zinc-600">Connect Image Input (left top handle)</p>
          }
        </div>
        <div className={`rounded-lg border p-2.5 transition-colors ${hasMotion ? 'border-violet-400/50 bg-violet-400/8' : 'border-nodeborder border-dashed'}`}>
          <p className="text-[9px] uppercase tracking-wide text-zinc-600 mb-1">← Motion Video</p>
          {data.motionVideoUrl
            ? <video src={data.motionVideoUrl} className="w-full h-14 object-cover rounded" muted />
            : <p className="text-[10px] text-zinc-600">Connect Video Input (left bottom handle)</p>
          }
        </div>
      </div>

      {/* Scene control */}
      <div className="space-y-1">
        <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Background source</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { id: 'image', label: 'From character image', desc: 'Keeps character\'s background' },
            { id: 'video', label: 'From motion video',   desc: 'Uses reference clip\'s background' },
          ].map(opt => (
            <button key={opt.id} onClick={() => updateNodeData(id, { sceneControl: opt.id })}
              className={`p-2 rounded-lg border text-left transition-colors ${sceneControl === opt.id ? 'border-violet-400 bg-violet-400/12 text-violet-200' : 'border-nodeborder text-zinc-500 hover:border-zinc-400'}`}>
              <div className="text-[10px] font-medium leading-tight">{opt.label}</div>
              <div className="text-[9px] opacity-60 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Resolution */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-zinc-500 w-20">Resolution</span>
        {['720p','1080p'].map(r => (
          <button key={r} onClick={() => updateNodeData(id, { resolution: r })}
            className={`flex-1 text-[10px] py-1 rounded-md border transition-colors ${resolution === r ? 'border-violet-400 bg-violet-400/12 text-violet-300' : 'border-nodeborder text-zinc-500 hover:border-zinc-400'}`}>
            {r} {r === '1080p' && <span className="opacity-50">(2× credits)</span>}
          </button>
        ))}
      </div>

      <div className="flex items-start gap-1.5 text-[10px] text-zinc-600 bg-black/20 rounded-lg px-2.5 py-2">
        <Info size={11} className="mt-0.5 flex-shrink-0 text-violet-400/50" />
        <span>Motion from the reference clip is transferred to the character — no prompt needed. Uses Kling 3.0.</span>
      </div>

      <button onClick={generate} disabled={running || !hasChar || !hasMotion}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-violet-600/15 border border-violet-500/30 text-violet-300 text-xs font-medium hover:bg-violet-600/25 transition-colors disabled:opacity-40">
        {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
        {running ? 'Transferring motion…' : 'Transfer Motion'}
      </button>

      {data.outputUrl && (
        <video src={data.outputUrl} className="w-full rounded-lg" controls muted loop />
      )}

      {/* Two distinct left handles */}
      <Handle type="target" position={Position.Left} id="char_image_in" style={{ top: '32%' }} />
      <Handle type="target" position={Position.Left} id="motion_video_in" style={{ top: '58%' }} />
      <Handle type="source" position={Position.Right} id="video_out" style={{ top: '50%' }} />
    </NodeShell>
  )
}
