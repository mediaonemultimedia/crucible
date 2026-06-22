import { useCallback, useEffect, useRef, useState } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { Brush, Trash2, Upload, ChevronDown, ChevronUp, Wand2, Loader2 } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import { tips } from '../tips/nodeTips'

const REGION_COLORS = ['#f97316','#22d3a0','#818cf8','#f43f5e','#facc15','#38bdf8']

let regionCounter = 0

export default function FramePainterNode({ id, data }) {
  const { updateNodeData } = useReactFlow()
  const canvasRef    = useRef(null)
  const overlayRef   = useRef(null)
  const videoRef     = useRef(null)
  const [drawing, setDrawing]   = useState(false)
  const [startPt, setStartPt]   = useState(null)
  const [currentRect, setCurrentRect] = useState(null)
  const [regions, setRegions]   = useState(data.regions || [])
  const [frameTime, setFrameTime] = useState(0)
  const [extracting, setExtracting] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [tool, setTool]         = useState('rect') // 'rect' | 'pan'

  const frameUrl = data.frameUrl || data.imageUrl

  // Draw all regions onto the overlay canvas
  const redrawOverlay = useCallback((rects, current) => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const allRects = current ? [...rects, { ...current, color: '#ffffff', label: '' }] : rects
    allRects.forEach((r, i) => {
      ctx.strokeStyle = r.color || REGION_COLORS[i % REGION_COLORS.length]
      ctx.lineWidth = 2
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.fillStyle = (r.color || REGION_COLORS[i % REGION_COLORS.length]) + '22'
      ctx.fillRect(r.x, r.y, r.w, r.h)
      if (r.label) {
        ctx.fillStyle = r.color || REGION_COLORS[i % REGION_COLORS.length]
        ctx.font = 'bold 11px Inter, sans-serif'
        ctx.fillText(r.label || `Region ${i + 1}`, r.x + 4, r.y + 14)
      }
    })
  }, [])

  useEffect(() => { redrawOverlay(regions, currentRect) }, [regions, currentRect, redrawOverlay])

  const getPos = (e) => {
    const canvas = overlayRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    }
  }

  const onMouseDown = (e) => {
    if (tool !== 'rect') return
    e.stopPropagation()
    const pos = getPos(e)
    setDrawing(true)
    setStartPt(pos)
    setCurrentRect({ x: pos.x, y: pos.y, w: 0, h: 0 })
  }

  const onMouseMove = (e) => {
    if (!drawing || !startPt) return
    e.stopPropagation()
    const pos = getPos(e)
    setCurrentRect({
      x: Math.min(pos.x, startPt.x),
      y: Math.min(pos.y, startPt.y),
      w: Math.abs(pos.x - startPt.x),
      h: Math.abs(pos.y - startPt.y),
    })
  }

  const onMouseUp = (e) => {
    if (!drawing || !currentRect) return
    e.stopPropagation()
    setDrawing(false)
    if (currentRect.w > 10 && currentRect.h > 10) {
      const newRegion = {
        id: `r${++regionCounter}`,
        ...currentRect,
        color: REGION_COLORS[regions.length % REGION_COLORS.length],
        label: '',
        instruction: '',
        attachedImageUrl: null,
        attachedFileId: null,
      }
      const next = [...regions, newRegion]
      setRegions(next)
      updateNodeData(id, { regions: next })
    }
    setCurrentRect(null)
    setStartPt(null)
  }

  const updateRegion = (regionId, patch) => {
    setRegions(prev => {
      const next = prev.map(r => r.id === regionId ? { ...r, ...patch } : r)
      updateNodeData(id, { regions: next })
      return next
    })
  }

  const deleteRegion = (regionId) => {
    setRegions(prev => {
      const next = prev.filter(r => r.id !== regionId)
      updateNodeData(id, { regions: next })
      return next
    })
  }

  const extractFrame = useCallback(async () => {
    if (!data.sourceVideoUrl) return
    setExtracting(true)
    try {
      const r = await fetch('/analyze/extract-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: data.sourceVideoUrl, timestamp: frameTime }),
      })
      const json = await r.json()
      updateNodeData(id, { frameUrl: json.url, frameFileId: json.file_id })
      setRegions([])
      updateNodeData(id, { regions: [] })
    } catch { }
    finally { setExtracting(false) }
  }, [data.sourceVideoUrl, frameTime, id, updateNodeData])

  const buildSpatialPrompt = useCallback(async () => {
    if (!regions.length) return
    setEnhancing(true)
    try {
      const regionDescriptions = regions.map((r, i) =>
        `Region ${i+1} (${r.label || 'unlabeled'}, position ${Math.round(r.x)},${Math.round(r.y)} size ${Math.round(r.w)}×${Math.round(r.h)}): ${r.instruction || 'no instruction'}`
      ).join('\n')
      const r = await fetch('/analyze/spatial-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regions: regionDescriptions, base_prompt: data.basePrompt || '' }),
      })
      const json = await r.json()
      updateNodeData(id, { spatialPrompt: json.prompt })
    } finally {
      setEnhancing(false)
    }
  }, [regions, data.basePrompt, id, updateNodeData])

  const uploadRegionImage = useCallback(async (regionId, file) => {
    const form = new FormData()
    form.append('file', file)
    try {
      const r = await fetch('/analyze/upload', { method: 'POST', body: form })
      const json = await r.json()
      updateRegion(regionId, { attachedImageUrl: json.url, attachedFileId: json.file_id })
    } catch { }
  }, [])

  return (
    <NodeShell label="Frame Painter" icon={<Brush size={14} />} color="#fb923c" status="idle" tips={tips.framePainter} width={360}>
      <Handle type="target" position={Position.Left} id="video_in" style={{ top: '30%' }} />
      <Handle type="target" position={Position.Left} id="image_in" style={{ top: '70%' }} />

      {/* Source: video scrubber or direct image */}
      {data.sourceVideoUrl && (
        <div className="space-y-1.5">
          <video ref={videoRef} src={data.sourceVideoUrl} className="w-full rounded hidden" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 whitespace-nowrap">Frame @ {frameTime.toFixed(1)}s</span>
            <input type="range" min={0} max={30} step={0.1} value={frameTime}
              onChange={e => setFrameTime(Number(e.target.value))}
              className="flex-1 accent-orange-400" />
            <button onClick={extractFrame} disabled={extracting}
              className="text-[10px] px-2 py-1 rounded bg-orange-500/15 border border-orange-500/30 text-orange-300 hover:bg-orange-500/25 flex items-center gap-1 whitespace-nowrap">
              {extracting ? <Loader2 size={10} className="animate-spin" /> : null}
              {extracting ? 'Extracting…' : 'Extract Frame'}
            </button>
          </div>
        </div>
      )}

      {/* Canvas area */}
      {frameUrl ? (
        <div className="relative rounded-lg overflow-hidden border border-nodeborder select-none"
          style={{ cursor: tool === 'rect' ? 'crosshair' : 'grab' }}>
          <img src={frameUrl} alt="frame" className="w-full block" ref={canvasRef} />
          <canvas
            ref={overlayRef}
            width={640} height={360}
            className="absolute inset-0 w-full h-full"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />
          {/* Tool toggle */}
          <div className="absolute top-1.5 right-1.5 flex gap-1">
            <button onClick={() => setTool('rect')}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${tool === 'rect' ? 'bg-orange-500/25 border-orange-400 text-orange-200' : 'bg-black/50 border-zinc-700 text-zinc-400'}`}>
              ☐ Draw
            </button>
            <button onClick={() => setTool('pan')}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${tool === 'pan' ? 'bg-orange-500/25 border-orange-400 text-orange-200' : 'bg-black/50 border-zinc-700 text-zinc-400'}`}>
              ✥ Pan
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-nodeborder py-8 text-center"
          onClick={() => document.getElementById(`fp-img-${id}`).click()}>
          <input id={`fp-img-${id}`} type="file" accept="image/*" className="hidden"
            onChange={e => {
              const file = e.target.files[0]
              if (!file) return
              const url = URL.createObjectURL(file)
              updateNodeData(id, { frameUrl: url })
            }} />
          <Brush size={20} className="mx-auto mb-1 text-zinc-600" />
          <p className="text-xs text-zinc-500">Connect a Video Input or drop an image to start painting</p>
        </div>
      )}

      {/* Regions panel */}
      {regions.length > 0 && (
        <div className="space-y-2">
          <button onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-between text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
            <span className="uppercase tracking-wide">{regions.length} painted region{regions.length > 1 ? 's' : ''}</span>
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>

          {expanded && regions.map((r, i) => (
            <div key={r.id} className="rounded-lg border p-2.5 space-y-2"
              style={{ borderColor: r.color + '60', background: r.color + '08' }}>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: r.color }} />
                <input
                  placeholder={`Region ${i+1} label (e.g. "person's right hand")`}
                  className="flex-1 bg-transparent text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                  value={r.label}
                  onChange={e => updateRegion(r.id, { label: e.target.value })}
                />
                <button onClick={() => deleteRegion(r.id)}
                  className="text-zinc-700 hover:text-danger transition-colors">
                  <Trash2 size={11} />
                </button>
              </div>

              <textarea
                rows={2}
                placeholder={`Instruction: "holding a bag of chips", "replaced with a coffee cup", "wearing a wristwatch"…`}
                className="w-full bg-black/30 border border-white/5 rounded px-2 py-1.5 text-[10px] text-zinc-300 placeholder:text-zinc-600 resize-none focus:outline-none leading-relaxed"
                value={r.instruction}
                onChange={e => updateRegion(r.id, { instruction: e.target.value })}
              />

              {/* Attach reference image to region */}
              <div
                className="rounded border border-dashed border-white/10 p-2 flex items-center gap-2 cursor-pointer hover:border-white/20 transition-colors"
                onClick={() => document.getElementById(`fp-r-${r.id}`).click()}>
                <input id={`fp-r-${r.id}`} type="file" accept="image/*" className="hidden"
                  onChange={e => e.target.files[0] && uploadRegionImage(r.id, e.target.files[0])} />
                {r.attachedImageUrl
                  ? <img src={r.attachedImageUrl} className="h-10 w-10 object-cover rounded flex-shrink-0" alt="" />
                  : <Upload size={12} className="text-zinc-600 flex-shrink-0" />
                }
                <span className="text-[10px] text-zinc-600">
                  {r.attachedImageUrl ? 'Reference image attached' : 'Attach reference image for this region'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Base scene note */}
      {regions.length > 0 && (
        <input
          placeholder="Overall scene context (optional): background, mood, camera…"
          className="w-full bg-black/30 border border-nodeborder rounded-lg px-2.5 py-1.5 text-[10px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none"
          value={data.basePrompt || ''}
          onChange={e => updateNodeData(id, { basePrompt: e.target.value })}
        />
      )}

      {/* Build spatial prompt */}
      {regions.length > 0 && (
        <button onClick={buildSpatialPrompt} disabled={enhancing}
          className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg bg-orange-500/12 border border-orange-500/25 text-orange-300 text-[11px] hover:bg-orange-500/20 transition-colors disabled:opacity-40">
          {enhancing ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
          {enhancing ? 'Claude is building spatial prompt…' : 'Build Spatial Prompt with Claude'}
        </button>
      )}

      {data.spatialPrompt && (
        <div className="rounded-lg bg-black/30 border border-orange-500/20 px-2.5 py-2">
          <p className="text-[9px] text-zinc-600 uppercase tracking-wide mb-1">Spatial prompt →</p>
          <p className="text-[10px] text-orange-200/70 leading-relaxed">{data.spatialPrompt}</p>
        </div>
      )}

      <Handle type="source" position={Position.Right} id="prompt_out" style={{ top: '40%' }} />
      <Handle type="source" position={Position.Right} id="frame_out" style={{ top: '65%' }} />
    </NodeShell>
  )
}
