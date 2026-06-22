import { Film, Image, ScanEye, Sparkles, ImagePlus, Clapperboard, User, MonitorPlay, Video, ArrowUpCircle, Shuffle, Brush } from 'lucide-react'

const GROUPS = [
  {
    label: 'Inputs',
    nodes: [
      { type: 'videoInput',    label: 'Video Input',      icon: Film,          color: '#6366f1', desc: 'Upload source footage' },
      { type: 'imageInput',    label: 'Image Input',      icon: Image,         color: '#06b6d4', desc: 'Style / clothing / face / product' },
    ]
  },
  {
    label: 'Analysis',
    nodes: [
      { type: 'subjectTagger', label: 'Subject Tagger',   icon: ScanEye,       color: '#8b5cf6', desc: 'Detect & label subjects with Claude' },
      { type: 'framePainter',  label: 'Frame Painter',    icon: Brush,         color: '#fb923c', desc: 'Draw regions & attach objects to frames' },
    ]
  },
  {
    label: 'Prompting',
    nodes: [
      { type: 'promptBuilder', label: 'Prompt Builder',   icon: Sparkles,      color: '#f59e0b', desc: 'Write & enhance generation prompts' },
      { type: 'cameraControls',label: 'Camera Controls',  icon: Video,         color: '#e879f9', desc: 'Pan, crane, orbit, hyperlapse & more' },
    ]
  },
  {
    label: 'Generation',
    nodes: [
      { type: 'imageGen',      label: 'Image Gen',        icon: ImagePlus,     color: '#10b981', desc: 'Flux / GPT Image 2 via Higgsfield' },
      { type: 'videoGen',      label: 'Video Gen',        icon: Clapperboard,  color: '#f97316', desc: 'Seedance / Kling / Veo / Wan' },
      { type: 'character',     label: 'Character',        icon: User,          color: '#ec4899', desc: 'Soul ID face consistency' },
      { type: 'motionTransfer',label: 'Motion Transfer',  icon: Shuffle,       color: '#a78bfa', desc: 'Apply motion from reference video to character' },
    ]
  },
  {
    label: 'Post',
    nodes: [
      { type: 'upscale',       label: 'Upscale',          icon: ArrowUpCircle, color: '#38bdf8', desc: 'Topaz or ByteDance up to 4K' },
      { type: 'output',        label: 'Output',           icon: MonitorPlay,   color: '#22d3a0', desc: 'Preview & download final result' },
    ]
  },
]

// Flatten for the drag handler
const NODE_TYPES = GROUPS.flatMap(g => g.nodes)

export default function Sidebar() {
  const onDragStart = (e, nodeType) => {
    e.dataTransfer.setData('application/reactflow', nodeType)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-node border-r border-nodeborder flex flex-col">
      <div className="px-4 py-3 border-b border-nodeborder">
        <h1 className="text-sm font-semibold text-white tracking-tight">AI Node Studio</h1>
        <p className="text-[10px] text-zinc-500 mt-0.5">Drag nodes onto the canvas</p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {GROUPS.map(group => (
          <div key={group.label}>
            <p className="text-[9px] uppercase tracking-widest text-zinc-600 px-1 mb-1">{group.label}</p>
            <div className="space-y-0.5">
              {group.nodes.map(n => {
                const Icon = n.icon
                return (
                  <div
                    key={n.type}
                    draggable
                    onDragStart={e => onDragStart(e, n.type)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-nodeborder bg-black/20 cursor-grab hover:border-zinc-600 hover:bg-black/40 transition-colors select-none active:cursor-grabbing"
                  >
                    <Icon size={13} style={{ color: n.color }} className="flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-200 leading-tight">{n.label}</p>
                      <p className="text-[10px] text-zinc-600 leading-tight truncate">{n.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-nodeborder space-y-1">
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          Powered by <span className="text-accent">Claude</span> + <span className="text-orange-400">Higgsfield</span>
        </p>
      </div>
    </aside>
  )
}
