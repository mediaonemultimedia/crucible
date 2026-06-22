import { useCallback, useState } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { ScanEye, Loader2 } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import { tips } from '../tips/nodeTips'

const TYPE_COLORS = {
  person: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  object: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  animal: 'bg-green-500/20 text-green-300 border-green-500/40',
  background: 'bg-zinc-600/30 text-zinc-400 border-zinc-600/40',
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
    <NodeShell label="Subject Tagger" icon={<ScanEye size={14} />} color="#8b5cf6" status={data.status} tips={tips.subjectTagger} width={290}>
      <Handle type="target" position={Position.Left} id="image_in" style={{ top: '50%' }} />

      {!data.sourceFileId && (
        <p className="text-xs text-zinc-500">Connect a Video Input or Image Input node first.</p>
      )}

      {data.sourceFileId && (
        <button
          onClick={detect}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-300 text-xs hover:bg-violet-600/30 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <ScanEye size={12} />}
          {loading ? 'Detecting with Claude…' : 'Detect Subjects'}
        </button>
      )}

      {subjects.length > 0 && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {subjects.map((s, i) => (
            <div key={i} className="rounded-lg border border-nodeborder bg-black/20 p-2 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${TYPE_COLORS[s.type] || TYPE_COLORS.object}`}>
                  {s.type}
                </span>
                <span className="text-xs font-medium text-zinc-200">{s.label}</span>
                <span className="ml-auto text-[10px] text-zinc-500">{s.position}</span>
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">{s.description}</p>
              <input
                className="w-full bg-transparent border border-nodeborder/50 rounded px-2 py-0.5 text-[10px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
                placeholder="Add notes for downstream nodes…"
                defaultValue={s.notes || ''}
                onChange={e => {
                  const updated = subjects.map((sub, j) => j === i ? { ...sub, notes: e.target.value } : sub)
                  updateNodeData(id, { subjects: updated })
                }}
              />
            </div>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Right} id="subjects" style={{ top: '50%' }} />
    </NodeShell>
  )
}
