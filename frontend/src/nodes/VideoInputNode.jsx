import { useCallback, useState } from 'react'
import { Position, useReactFlow } from '@xyflow/react'
import { Film, Upload } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import NodeHandle from '../components/NodeHandle'
import { tips } from '../tips/nodeTips'

export default function VideoInputNode({ id, data }) {
  const { updateNodeData } = useReactFlow()
  const [dragging, setDragging] = useState(false)

  const upload = useCallback(async (file) => {
    const form = new FormData()
    form.append('file', file)
    updateNodeData(id, { status: 'running', label: file.name })
    try {
      const r = await fetch('/analyze/upload', { method: 'POST', body: form })
      const json = await r.json()
      updateNodeData(id, { status: 'done', fileId: json.file_id, url: json.url, label: json.original_name })
    } catch {
      updateNodeData(id, { status: 'error' })
    }
  }, [id, updateNodeData])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) upload(file)
  }, [upload])

  return (
    <NodeShell id={id} label="Video Input" icon={<Film size={13} />} color="#6366f1" status={data.status} tips={tips.videoInput} width={260}>
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        className={`rounded-xl border border-dashed transition-all duration-300 cursor-pointer text-center py-5 px-3 ${
          dragging
            ? 'border-indigo-400/40 bg-indigo-400/[0.06]'
            : 'border-white/[0.06] hover:border-white/10 hover:bg-white/[0.02]'
        }`}
        onClick={() => document.getElementById(`vi-${id}`).click()}
      >
        <input
          id={`vi-${id}`}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={e => e.target.files[0] && upload(e.target.files[0])}
        />
        <Upload size={16} className="mx-auto mb-2 t-tertiary" />
        {data.label
          ? <p className="text-[11px] t-primary truncate px-2">{data.label}</p>
          : <p className="text-[10px] t-secondary font-light">Drop video or click to browse</p>
        }
        {data.url && (
          <video src={data.url} className="mt-3 w-full rounded-lg" controls muted />
        )}
      </div>

      <NodeHandle type="source" position={Position.Right} id="video" style={{ top: '50%' }} />
    </NodeShell>
  )
}
