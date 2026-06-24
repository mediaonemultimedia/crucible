import { useState } from 'react'
import { Position, useReactFlow } from '@xyflow/react'
import { Video } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import NodeHandle from '../components/NodeHandle'
import { tips } from '../tips/nodeTips'

const CAMERA_GROUPS = [
  {
    label: 'Static',
    moves: [
      { id: 'locked',   label: 'Locked Off',    icon: '⬛', prompt: 'static locked-off shot, no camera movement' },
      { id: 'handheld', label: 'Handheld',       icon: '🤝', prompt: 'handheld verité style, subtle natural camera movement, slight breathing motion' },
      { id: 'steadicam',label: 'Steadicam',      icon: '🎬', prompt: 'steadicam glide shot, smooth floating camera movement' },
    ]
  },
  {
    label: 'Horizontal',
    moves: [
      { id: 'pan_l',    label: 'Pan Left',       icon: '◀', prompt: 'smooth pan left' },
      { id: 'pan_r',    label: 'Pan Right',      icon: '▶', prompt: 'smooth pan right' },
      { id: 'whip',     label: 'Whip Pan',       icon: '⚡', prompt: 'fast whip pan, blurred motion transition' },
    ]
  },
  {
    label: 'Vertical',
    moves: [
      { id: 'tilt_u',   label: 'Tilt Up',        icon: '▲', prompt: 'slow tilt up, camera tilts upward' },
      { id: 'tilt_d',   label: 'Tilt Down',      icon: '▼', prompt: 'slow tilt down, camera tilts downward' },
      { id: 'crane_u',  label: 'Crane Up',        icon: '🏗', prompt: 'smooth crane up, camera rises vertically, revealing scene above' },
      { id: 'crane_d',  label: 'Crane Down',      icon: '⬇', prompt: 'smooth crane down, camera descends vertically' },
    ]
  },
  {
    label: 'Depth',
    moves: [
      { id: 'dolly_in', label: 'Push In',         icon: '🔭', prompt: 'slow dolly push in toward subject, camera moves forward' },
      { id: 'dolly_out',label: 'Pull Out',         icon: '↩', prompt: 'slow dolly pull back, camera retreats, revealing more of the scene' },
      { id: 'zoom_in',  label: 'Zoom In',          icon: '🔍', prompt: 'slow optical zoom in, telephoto compression' },
      { id: 'zoom_out', label: 'Zoom Out',          icon: '🔎', prompt: 'slow optical zoom out, widening view' },
    ]
  },
  {
    label: 'Tracking',
    moves: [
      { id: 'track_f',  label: 'Follow Track',    icon: '👣', prompt: 'smooth side tracking shot following subject, camera moves parallel to subject' },
      { id: 'track_l',  label: 'Lead Track',      icon: '🚀', prompt: 'camera leads subject, pulling ahead, subject walking into frame from behind' },
      { id: 'track_p',  label: 'Push Behind',     icon: '🎯', prompt: 'over-shoulder push shot, camera close behind subject following movement' },
    ]
  },
  {
    label: 'Orbital',
    moves: [
      { id: 'orbit_l',  label: 'Orbit Left',      icon: '↺', prompt: 'smooth orbit around subject circling left, camera arcs left while facing subject' },
      { id: 'orbit_r',  label: 'Orbit Right',     icon: '↻', prompt: 'smooth orbit around subject circling right, camera arcs right while facing subject' },
      { id: 'orbit_360',label: '360 Orbit',        icon: '🔄', prompt: 'full 360 degree orbit around subject, continuous circular camera movement' },
    ]
  },
  {
    label: 'Aerial',
    moves: [
      { id: 'aerial_d', label: 'Aerial Descent',  icon: '🛸', prompt: 'drone shot descending, starting bird\'s eye overhead then lowering to eye level' },
      { id: 'aerial_u', label: 'Aerial Ascent',   icon: '🚁', prompt: 'aerial ascending drone shot, camera rises pulling back and up to reveal landscape' },
      { id: 'hyper',    label: 'Hyperlapse',       icon: '⏩', prompt: 'hyperlapse, time-compressed motion, fluid fast-moving camera through environment' },
    ]
  },
  {
    label: 'Framing',
    moves: [
      { id: 'birds',    label: "Bird's Eye",       icon: '🦅', prompt: "bird's eye view, camera directly overhead looking straight down" },
      { id: 'worm',     label: "Worm's Eye",       icon: '🐛', prompt: "worm's eye view, extreme low angle looking up at subject" },
      { id: 'dutch',    label: 'Dutch Angle',      icon: '📐', prompt: 'dutch angle, canted frame tilted 20-30 degrees, unsettling tension' },
      { id: 'rack',     label: 'Rack Focus',       icon: '🎞', prompt: 'rack focus pull, shallow depth of field shifts focus from foreground to background' },
    ]
  },
]

const SPEEDS = [
  { id: 'slow',   label: 'Slow',   modifier: 'slow, deliberate' },
  { id: 'medium', label: 'Medium', modifier: 'moderate speed' },
  { id: 'fast',   label: 'Fast',   modifier: 'fast, dynamic' },
]

export default function CameraControlsNode({ id, data }) {
  const { updateNodeData } = useReactFlow()
  const [expanded, setExpanded] = useState(null)

  const selected = data.selectedMoves || []
  const speed = data.speed || 'medium'

  const toggleMove = (moveId) => {
    const move = CAMERA_GROUPS.flatMap(g => g.moves).find(m => m.id === moveId)
    if (!move) return
    const already = selected.find(s => s.id === moveId)
    const next = already
      ? selected.filter(s => s.id !== moveId)
      : selected.length < 2 ? [...selected, move] : [selected[1], move]
    updateNodeData(id, { selectedMoves: next, cameraPrompt: buildPrompt(next, speed) })
  }

  const buildPrompt = (moves, spd) => {
    if (!moves.length) return ''
    const speedMod = SPEEDS.find(s => s.id === spd)?.modifier || ''
    const moveText = moves.map(m => m.prompt).join(', combined with ')
    return `${speedMod} ${moveText}`.trim()
  }

  const onSpeedChange = (spd) => {
    updateNodeData(id, { speed: spd, cameraPrompt: buildPrompt(selected, spd) })
  }

  const prompt = data.cameraPrompt || ''

  return (
    <NodeShell id={id} label="Camera Controls" icon={<Video size={13} />} color="#e879f9" status="idle" tips={tips.cameraControls} width={320}>
      {/* Speed */}
      <div className="flex gap-1.5 items-center">
        <span className="text-[9px] t-tertiary uppercase tracking-wider font-medium w-10">Speed</span>
        {SPEEDS.map(s => (
          <button
            key={s.id}
            onClick={() => onSpeedChange(s.id)}
            className={`pill-btn flex-1 ${speed === s.id ? 'active-fuchsia' : ''}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Group grid */}
      <div className="space-y-1 max-h-72 overflow-y-auto pr-0.5">
        {CAMERA_GROUPS.map(group => (
          <div key={group.label}>
            <button
              onClick={() => setExpanded(expanded === group.label ? null : group.label)}
              className="w-full flex items-center justify-between text-[9px] t-secondary uppercase tracking-wider py-1.5 hover:t-secondary transition-colors font-medium"
            >
              <span>{group.label}</span>
              <span className="t-secondary text-[8px]">{expanded === group.label ? '▲' : '▼'}</span>
            </button>

            {expanded === group.label && (
              <div className="grid grid-cols-2 gap-1.5 pb-1">
                {group.moves.map(move => {
                  const isSelected = selected.find(s => s.id === move.id)
                  return (
                    <button
                      key={move.id}
                      onClick={() => toggleMove(move.id)}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all duration-200"
                      style={{
                        background: isSelected ? 'rgba(232,121,249,0.08)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isSelected ? 'rgba(232,121,249,0.25)' : 'rgba(255,255,255,0.04)'}`,
                        color: isSelected ? 'rgba(232,121,249,0.8)' : 'var(--text-tertiary)',
                      }}
                    >
                      <span className="text-sm leading-none">{move.icon}</span>
                      <span className="text-[10px] font-medium leading-tight">{move.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[9px] t-tertiary font-light italic">Select up to 2 moves to combine</p>

      {prompt && (
        <div className="rounded-xl px-3 py-2.5"
          style={{ background: 'rgba(232,121,249,0.03)', border: '1px solid rgba(232,121,249,0.08)' }}>
          <p className="text-[8px] t-tertiary uppercase tracking-wider mb-1 font-medium">Camera language</p>
          <p className="text-[10px] font-light leading-relaxed" style={{ color: 'rgba(232,121,249,0.5)' }}>{prompt}</p>
        </div>
      )}

      <NodeHandle type="source" position={Position.Right} id="camera_prompt" style={{ top: '50%' }} />
    </NodeShell>
  )
}
