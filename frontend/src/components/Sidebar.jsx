import { useState } from 'react'
import { Film, Image, ScanEye, Sparkles, ImagePlus, Clapperboard, User, MonitorPlay, Video, ArrowUpCircle, Shuffle, Brush, Sun, Moon, Plus, ChevronDown, ChevronUp, Clock, Trash2 } from 'lucide-react'
import { useThemeStore } from '../stores/themeStore'
import { useProjectStore } from '../stores/projectStore'

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
      { type: 'motionTransfer',label: 'Motion Transfer',  icon: Shuffle,       color: '#a78bfa', desc: 'Apply motion from reference video' },
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

function timeAgo(ts) {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

export default function Sidebar({ onNewProject, onLoadProject }) {
  const { theme, toggle } = useThemeStore()
  const { projects, deleteProject } = useProjectStore()
  const [historyOpen, setHistoryOpen] = useState(true)

  const onDragStart = (e, nodeType) => {
    e.dataTransfer.setData('application/reactflow', nodeType)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <aside className="w-56 flex-shrink-0 glass flex flex-col" style={{ borderRight: '1px solid var(--divider)' }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-[13px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>AI Node Studio</h1>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Drag nodes onto the canvas</p>
        </div>
        <button
          onClick={toggle}
          className="w-8 h-8 flex items-center justify-center rounded-xl transition-all duration-200"
          style={{ background: 'var(--pill-bg)', border: '1px solid var(--pill-border)', color: 'var(--text-secondary)' }}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>

      <div className="h-px" style={{ background: 'var(--divider)' }} />

      {/* New Project button */}
      <div className="px-3 py-2.5">
        <button
          onClick={onNewProject}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-medium transition-all duration-200"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
          }}
          onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.15)'}
          onMouseLeave={e => e.currentTarget.style.filter = 'none'}
        >
          <Plus size={13} strokeWidth={2.5} />
          New Project
        </button>
      </div>

      <div className="h-px" style={{ background: 'var(--divider)' }} />

      {/* Node list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {GROUPS.map(group => (
          <div key={group.label}>
            <p className="text-[9px] uppercase tracking-[0.15em] px-2 mb-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>{group.label}</p>
            <div className="space-y-1">
              {group.nodes.map(n => {
                const Icon = n.icon
                return (
                  <div
                    key={n.type}
                    draggable
                    onDragStart={e => onDragStart(e, n.type)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-grab
                               border border-transparent
                               transition-all duration-200 select-none active:cursor-grabbing active:scale-[0.97]"
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--pill-hover-bg)'; e.currentTarget.style.borderColor = 'var(--glass-border)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
                  >
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                         style={{ background: `${n.color}15` }}>
                      <Icon size={12} style={{ color: n.color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium leading-tight" style={{ color: 'var(--text-secondary)' }}>{n.label}</p>
                      <p className="text-[9px] leading-tight truncate" style={{ color: 'var(--text-muted)' }}>{n.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="h-px" style={{ background: 'var(--divider)' }} />

      {/* Recent Projects */}
      <div className="flex-shrink-0" style={{ maxHeight: '35vh' }}>
        <button
          onClick={() => setHistoryOpen(o => !o)}
          className="w-full flex items-center gap-2 px-5 py-2.5 transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--pill-hover-bg)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <Clock size={12} />
          <span className="text-[10px] font-medium uppercase tracking-wider">Recent Projects</span>
          <span className="ml-auto text-[9px]" style={{ color: 'var(--text-muted)' }}>{projects.length}</span>
          {historyOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {historyOpen && (
          <div className="overflow-y-auto px-3 pb-2 space-y-1" style={{ maxHeight: 'calc(35vh - 40px)' }}>
            {projects.length === 0 && (
              <p className="text-[9px] px-2 py-3 text-center" style={{ color: 'var(--text-muted)' }}>
                Projects auto-save when a generation completes
              </p>
            )}
            {projects.map(p => (
              <div
                key={p.id}
                className="group flex items-start gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer transition-all duration-200"
                style={{ border: '1px solid transparent' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--pill-hover-bg)'; e.currentTarget.style.borderColor = 'var(--glass-border)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
                onClick={() => onLoadProject(p)}
              >
                {/* Thumbnail */}
                <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden"
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)' }}>
                  {p.preview ? (
                    p.preview.match(/\.(mp4|webm|mov)$/i)
                      ? <video src={p.preview} className="w-full h-full object-cover" muted />
                      : <img src={p.preview} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <Clapperboard size={12} style={{ color: 'var(--text-muted)' }} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium truncate leading-tight" style={{ color: 'var(--text-primary)' }}>
                    {p.name}
                  </p>
                  {p.promptSnippet && (
                    <p className="text-[8px] truncate leading-tight mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {p.promptSnippet}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>{timeAgo(p.timestamp)}</span>
                    {p.models?.length > 0 && (
                      <span className="text-[7px] px-1.5 py-0.5 rounded-full"
                        style={{ background: 'var(--pill-bg)', border: '1px solid var(--pill-border)', color: 'var(--text-muted)' }}>
                        {p.models[0]}
                      </span>
                    )}
                  </div>
                </div>

                {/* Delete */}
                <button
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all duration-200"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                  onClick={(e) => { e.stopPropagation(); deleteProject(p.id) }}
                  title="Delete project"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="h-px" style={{ background: 'var(--divider)' }} />

      {/* Footer */}
      <div className="px-5 py-3">
        <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
          Powered by <span style={{ color: 'var(--accent)' }}>Claude</span> + <span className="text-orange-400">Higgsfield</span>
        </p>
      </div>
    </aside>
  )
}
