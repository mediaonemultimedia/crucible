import { useCallback, useEffect, useRef, useState } from 'react'
import { Position, useReactFlow } from '@xyflow/react'
import { Brush, Trash2, Upload, ChevronDown, ChevronUp, Wand2, Loader2 } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import NodeHandle from '../components/NodeHandle'
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
  const [tool, setTool]         = useState('rect')

  const frameUrl = data.frameUrl || data.imageUrl

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
      ctx.fillStyle = (r.color || REGION_COLORS[i % REGION_COLORS.length]) + '15'
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
        `Region ${i+1} (${r.label || 'unlabeled'}, position ${Math.round(r.x)},${Math.round(r.y)} size ${Math.round(r.w)}x${Math.round(r.h)}): ${r.instruction || 'no instruction'}`
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
    <NodeShell id={id} label="Frame Painter" icon={<Brush size={13} />} color="#fb923c" status="idle" tips={tips.framePainter} width={360}>
      <NodeHandle type="target" position={Position.Left} id="video_in" style={{ top: '30%' }} />
      <NodeHandle type="target" position={Position.Left} id="image_in" style={{ top: '70%' }} />

      {data.sourceVideoUrl && (
        <div className="space-y-2">
          <video ref={videoRef} src={data.sourceVideoUrl} className="w-full rounded hidden" />
          <div className="flex items-center gap-2">
            <span className="text-[9px] t-secondary whitespace-nowrap font-medium">Frame @ {frameTime.toFixed(1)}s</span>
            <input type="range" min={0} max={30} step={0.1} value={frameTime}
              onChange={e => setFrameTime(Number(e.target.value))}
              className="flex-1 accent-orange-400" />
            <button onClick={extractFrame} disabled={extracting}
              className="pill-btn flex items-center gap-1 whitespace-nowrap"
              style={extracting ? {} : { background: 'rgba(249,115,22,0.06)', borderColor: 'rgba(249,115,22,0.15)', color: 'rgba(249,115,22,0.7)' }}>
              {extracting ? <Loader2 size={9} className="animate-spin" /> : null}
              {extracting ? 'Extracting...' : 'Extract Frame'}
            </button>
          </div>
        </div>
      )}

      {frameUrl ? (
        <div className="relative rounded-xl overflow-hidden select-none nodrag nopan"
          style={{ cursor: tool === 'rect' ? 'crosshair' : 'grab', border: '1px solid rgba(255,255,255,0.06)' }}>
          <img src={frameUrl} alt="frame" className="w-full block" ref={canvasRef} />
          <canvas
            ref={overlayRef}
            width={640} height={360}
            className="absolute inset-0 w-full h-full nodrag nopan"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />
          <div className="absolute top-2 right-2 flex gap-1">
            <button onClick={() => setTool('rect')}
              className={`pill-btn text-[9px] ${tool === 'rect' ? 'active-orange' : ''}`}
              style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
              Draw
            </button>
            <button onClick={() => setTool('pan')}
              className={`pill-btn text-[9px] ${tool === 'pan' ? 'active-orange' : ''}`}
              style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
              Pan
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/[0.06] py-8 text-center cursor-pointer hover:border-white/10 hover:bg-white/[0.01] transition-all duration-200"
          onClick={() => document.getElementById(`fp-img-${id}`).click()}>
          <input id={`fp-img-${id}`} type="file" accept="image/*" className="hidden"
            onChange={e => {
              const file = e.target.files[0]
              if (!file) return
              const url = URL.createObjectURL(file)
              updateNodeData(id, { frameUrl: url })
            }} />
          <Brush size={18} className="mx-auto mb-2 t-secondary" />
          <p className="text-[10px] t-tertiary font-light">Connect a Video Input or drop an image to start painting</p>
        </div>
      )}

      {regions.length > 0 && (
        <div className="space-y-2">
          <button onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-between text-[9px] t-secondary hover:t-secondary transition-colors font-medium">
            <span className="uppercase tracking-wider">{regions.length} painted region{regions.length > 1 ? 's' : ''}</span>
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>

          {expanded && regions.map((r, i) => (
            <div key={r.id} className="rounded-xl p-3 space-y-2"
              style={{ border: `1px solid ${r.color}18`, background: `${r.color}06` }}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
                <input
                  placeholder={`Region ${i+1} label`}
                  className="flex-1 bg-transparent text-[10px] t-secondary placeholder:t-tertiary focus:outline-none font-light"
                  value={r.label}
                  onChange={e => updateRegion(r.id, { label: e.target.value })}
                />
                <button onClick={() => deleteRegion(r.id)}
                  className="t-secondary hover:text-danger/60 transition-colors">
                  <Trash2 size={10} />
                </button>
              </div>

              <textarea
                rows={2}
                placeholder="Instruction: what should appear here..."
                className="glass-input w-full px-2.5 py-1.5 text-[10px] resize-none leading-relaxed"
                value={r.instruction}
                onChange={e => updateRegion(r.id, { instruction: e.target.value })}
              />

              <div
                className="rounded-lg p-2 flex items-center gap-2 cursor-pointer transition-all duration-200"
                style={{ border: '1px dashed rgba(255,255,255,0.06)' }}
                onClick={() => document.getElementById(`fp-r-${r.id}`).click()}>
                <input id={`fp-r-${r.id}`} type="file" accept="image/*" className="hidden"
                  onChange={e => e.target.files[0] && uploadRegionImage(r.id, e.target.files[0])} />
                {r.attachedImageUrl
                  ? <img src={r.attachedImageUrl} className="h-10 w-10 object-cover rounded-lg flex-shrink-0" alt="" />
                  : <Upload size={11} className="t-secondary flex-shrink-0" />
                }
                <span className="text-[9px] t-tertiary font-light">
                  {r.attachedImageUrl ? 'Reference attached' : 'Attach reference image'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {regions.length > 0 && (
        <input
          placeholder="Overall scene context (optional)"
          className="glass-input w-full px-3 py-2 text-[10px]"
          value={data.basePrompt || ''}
          onChange={e => updateNodeData(id, { basePrompt: e.target.value })}
        />
      )}

      {regions.length > 0 && (
        <button onClick={buildSpatialPrompt} disabled={enhancing}
          className="action-btn"
          style={{ background: 'rgba(249,115,22,0.06)', borderColor: 'rgba(249,115,22,0.15)', color: 'rgba(249,115,22,0.7)' }}>
          {enhancing ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
          {enhancing ? 'Claude is building spatial prompt...' : 'Build Spatial Prompt with Claude'}
        </button>
      )}

      {data.spatialPrompt && (
        <div className="rounded-xl px-3 py-2.5"
          style={{ background: 'rgba(249,115,22,0.03)', border: '1px solid rgba(249,115,22,0.08)' }}>
          <p className="text-[8px] t-tertiary uppercase tracking-wider mb-1 font-medium">Spatial prompt</p>
          <p className="text-[10px] font-light leading-relaxed" style={{ color: 'rgba(249,115,22,0.5)' }}>{data.spatialPrompt}</p>
        </div>
      )}

      <NodeHandle type="source" position={Position.Right} id="prompt_out" style={{ top: '40%' }} />
      <NodeHandle type="source" position={Position.Right} id="frame_out" style={{ top: '65%' }} />
    </NodeShell>
  )
}
