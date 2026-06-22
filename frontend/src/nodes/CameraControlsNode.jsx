import { useState } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { Video } from 'lucide-react'
import NodeShell from '../components/NodeShell'
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
    <NodeShell label="Camera Controls" icon={<Video size={14} />} color="#e879f9" status="idle" tips={tips.cameraControls} width={320}>
      {/* Speed */}
      <div className="flex gap-1.5 items-center">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wide w-10">Speed</span>
        {SPEEDS.map(s => (
          <button
            key={s.id}
            onClick={() => onSpeedChange(s.id)}
            className={`flex-1 text-[10px] py-1 rounded-md border transition-colors ${
              speed === s.id
                ? 'border-fuchsia-400 bg-fuchsia-400/15 text-fuchsia-300'
                : 'border-nodeborder text-zinc-500 hover:border-zinc-500'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Group grid */}
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
        {CAMERA_GROUPS.map(group => (
          <div key={group.label}>
            <button
              onClick={() => setExpanded(expanded === group.label ? null : group.label)}
              className="w-full flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-wide py-1 hover:text-zinc-400 transition-colors"
            >
              <span>{group.label}</span>
              <span className="text-zinc-600">{expanded === group.label ? '▲' : '▼'}</span>
            </button>

            {expanded === group.label && (
              <div className="grid grid-cols-2 gap-1.5">
                {group.moves.map(move => {
                  const isSelected = selected.find(s => s.id === move.id)
                  return (
                    <button
                      key={move.id}
                      onClick={() => toggleMove(move.id)}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-colors ${
                        isSelected
                          ? 'border-fuchsia-400 bg-fuchsia-400/15 text-fuchsia-200'
                          : 'border-nodeborder text-zinc-400 hover:border-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <span className="text-base leading-none">{move.icon}</span>
                      <span className="text-[10px] font-medium leading-tight">{move.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[10px] text-zinc-600 italic">Select up to 2 moves to combine</p>

      {/* Generated camera language */}
      {prompt && (
        <div className="rounded-lg bg-black/30 border border-fuchsia-500/20 px-2.5 py-2">
          <p className="text-[9px] text-zinc-600 uppercase tracking-wide mb-1">Camera language →</p>
          <p className="text-[10px] text-fuchsia-300/80 leading-relaxed">{prompt}</p>
        </div>
      )}

      <Handle type="source" position={Position.Right} id="camera_prompt" style={{ top: '50%' }} />
    </NodeShell>
  )
}
