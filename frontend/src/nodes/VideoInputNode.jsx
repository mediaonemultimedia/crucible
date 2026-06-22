import { useCallback, useState } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { Film, Upload } from 'lucide-react'
import NodeShell from '../components/NodeShell'
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
    <NodeShell label="Video Input" icon={<Film size={14} />} color="#6366f1" status={data.status} tips={tips.videoInput} width={260}>
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        className={`rounded-lg border-2 border-dashed transition-colors cursor-pointer text-center py-4 px-2 ${
          dragging ? 'border-accent bg-accentsoft' : 'border-nodeborder hover:border-accent/50'
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
        <Upload size={18} className="mx-auto mb-1 text-zinc-500" />
        {data.label
          ? <p className="text-xs text-zinc-300 truncate px-2">{data.label}</p>
          : <p className="text-xs text-zinc-500">Drop video or click to browse</p>
        }
        {data.url && (
          <video src={data.url} className="mt-2 w-full rounded" controls muted />
        )}
      </div>

      <Handle type="source" position={Position.Right} id="video" style={{ top: '50%' }} />
    </NodeShell>
  )
}
