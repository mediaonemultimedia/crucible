import { useCallback, useState } from 'react'
import { Position, useReactFlow } from '@xyflow/react'
import { ScanEye, Loader2 } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import NodeHandle from '../components/NodeHandle'
import { tips } from '../tips/nodeTips'

const TYPE_COLORS = {
  person:     { bg: 'rgba(139,92,246,0.08)', text: 'rgba(139,92,246,0.7)', border: 'rgba(139,92,246,0.2)' },
  object:     { bg: 'rgba(6,182,212,0.08)',   text: 'rgba(6,182,212,0.7)',  border: 'rgba(6,182,212,0.2)' },
  animal:     { bg: 'rgba(16,185,129,0.08)',  text: 'rgba(16,185,129,0.7)', border: 'rgba(16,185,129,0.2)' },
  background: { bg: 'rgba(255,255,255,0.03)', text: 'var(--text-tertiary)', border: 'rgba(255,255,255,0.06)' },
}

export default function SubjectTaggerNode({ id, data }) {
  const { updateNodeData } = useReactFlow()
  const [loading, setLoading] = useState(false)

  const detect = useCallback(async () => {
    if (!data.sourceFileId) return
    setLoading(true)
    updateNodeData(id, { status: 'running', subjects: [] })
    try {
      const r = await fetch(`/analyze/subjects/${data.sourceFileId}`, { method: 'POST' })
      const json = await r.json()
      updateNodeData(id, { status: 'done', subjects: json.subjects })
    } catch {
      updateNodeData(id, { status: 'error' })
    } finally {
      setLoading(false)
    }
  }, [id, data.sourceFileId, updateNodeData])

  const subjects = data.subjects || []

  return (
    <NodeShell id={id} label="Subject Tagger" icon={<ScanEye size={13} />} color="#8b5cf6" status={data.status} tips={tips.subjectTagger} width={290}>
      <NodeHandle type="target" position={Position.Left} id="image_in" style={{ top: '50%' }} />

      {!data.sourceFileId && (
        <p className="text-[10px] t-secondary font-light">Connect a Video Input or Image Input node first.</p>
      )}

      {data.sourceFileId && (
        <button onClick={detect} disabled={loading}
          className="action-btn"
          style={{ background: 'rgba(139,92,246,0.08)', borderColor: 'rgba(139,92,246,0.2)', color: 'rgba(139,92,246,0.8)' }}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : <ScanEye size={12} />}
          {loading ? 'Detecting with Claude...' : 'Detect Subjects'}
        </button>
      )}

      {subjects.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {subjects.map((s, i) => {
            const colors = TYPE_COLORS[s.type] || TYPE_COLORS.object
            return (
              <div key={i} className="rounded-xl p-2.5 space-y-1.5"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}>
                    {s.type}
                  </span>
                  <span className="text-[11px] font-medium t-primary">{s.label}</span>
                  <span className="ml-auto text-[9px] t-tertiary">{s.position}</span>
                </div>
                <p className="text-[9px] t-secondary leading-relaxed font-light">{s.description}</p>
                <input
                  className="glass-input w-full px-2.5 py-1 text-[10px]"
                  placeholder="Add notes for downstream nodes..."
                  defaultValue={s.notes || ''}
                  onChange={e => {
                    const updated = subjects.map((sub, j) => j === i ? { ...sub, notes: e.target.value } : sub)
                    updateNodeData(id, { subjects: updated })
                  }}
                />
              </div>
            )
          })}
        </div>
      )}

      <NodeHandle type="source" position={Position.Right} id="subjects" style={{ top: '50%' }} />
    </NodeShell>
  )
}
