import { useCallback, useState } from 'react'
import { Position, useReactFlow } from '@xyflow/react'
import { Shuffle, Loader2, Play, Info } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import NodeHandle from '../components/NodeHandle'
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
    <NodeShell id={id} label="Motion Transfer" icon={<Shuffle size={13} />} color="#a78bfa" status={data.status} tips={tips.motionTransfer} width={300}>

      {/* Input slots */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-2.5 transition-all duration-200"
          style={{
            background: hasChar ? 'rgba(139,92,246,0.04)' : 'transparent',
            border: `1px ${hasChar ? 'solid' : 'dashed'} ${hasChar ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)'}`,
          }}>
          <p className="text-[8px] uppercase tracking-wider t-tertiary mb-1.5 font-medium">Character Image</p>
          {data.characterImageUrl
            ? <img src={data.characterImageUrl} className="w-full h-14 object-cover rounded-lg" alt="character" />
            : <p className="text-[9px] t-tertiary font-light">Connect Image Input</p>
          }
        </div>
        <div className="rounded-xl p-2.5 transition-all duration-200"
          style={{
            background: hasMotion ? 'rgba(139,92,246,0.04)' : 'transparent',
            border: `1px ${hasMotion ? 'solid' : 'dashed'} ${hasMotion ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)'}`,
          }}>
          <p className="text-[8px] uppercase tracking-wider t-tertiary mb-1.5 font-medium">Motion Video</p>
          {data.motionVideoUrl
            ? <video src={data.motionVideoUrl} className="w-full h-14 object-cover rounded-lg" muted />
            : <p className="text-[9px] t-tertiary font-light">Connect Video Input</p>
          }
        </div>
      </div>

      {/* Scene control */}
      <div className="space-y-1.5">
        <p className="text-[9px] t-tertiary uppercase tracking-wider font-medium">Background source</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { id: 'image', label: 'From character image', desc: 'Keeps character\'s background' },
            { id: 'video', label: 'From motion video',   desc: 'Uses reference clip\'s background' },
          ].map(opt => (
            <button key={opt.id} onClick={() => updateNodeData(id, { sceneControl: opt.id })}
              className="p-2.5 rounded-xl text-left transition-all duration-200"
              style={{
                background: sceneControl === opt.id ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${sceneControl === opt.id ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)'}`,
                color: sceneControl === opt.id ? 'rgba(139,92,246,0.7)' : 'var(--text-tertiary)',
              }}>
              <div className="text-[10px] font-medium leading-tight">{opt.label}</div>
              <div className="text-[9px] opacity-50 mt-0.5 font-light">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Resolution */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] t-tertiary font-medium w-20">Resolution</span>
        {['720p','1080p'].map(r => (
          <button key={r} onClick={() => updateNodeData(id, { resolution: r })}
            className={`pill-btn flex-1 ${resolution === r ? 'active-violet' : ''}`}>
            {r} {r === '1080p' && <span className="opacity-40">(2x)</span>}
          </button>
        ))}
      </div>

      <div className="flex items-start gap-2 rounded-xl px-3 py-2.5"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
        <Info size={10} className="mt-0.5 flex-shrink-0" style={{ color: 'rgba(139,92,246,0.3)' }} />
        <span className="text-[9px] t-secondary font-light leading-relaxed">Motion from the reference clip is transferred to the character. No prompt needed. Uses Kling 3.0.</span>
      </div>

      <button onClick={generate} disabled={running || !hasChar || !hasMotion}
        className="action-btn"
        style={{ background: 'rgba(139,92,246,0.08)', borderColor: 'rgba(139,92,246,0.2)', color: 'rgba(139,92,246,0.8)' }}>
        {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
        {running ? 'Transferring motion...' : 'Transfer Motion'}
      </button>

      {data.outputUrl && (
        <video src={data.outputUrl} className="w-full rounded-xl" controls muted loop />
      )}

      <NodeHandle type="target" position={Position.Left} id="char_image_in" style={{ top: '32%' }} />
      <NodeHandle type="target" position={Position.Left} id="motion_video_in" style={{ top: '58%' }} />
      <NodeHandle type="source" position={Position.Right} id="video_out" style={{ top: '50%' }} />
    </NodeShell>
  )
}
