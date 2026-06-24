import { useCallback, useState } from 'react'
import { Position, useReactFlow } from '@xyflow/react'
import { Image } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import NodeHandle from '../components/NodeHandle'
import { tips } from '../tips/nodeTips'

const ROLES = ['Reference', 'Style', 'Clothing', 'Face', 'Mask', 'Product']

export default function ImageInputNode({ id, data }) {
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
    <NodeShell id={id} label="Image Input" icon={<Image size={13} />} color="#06b6d4" status={data.status} tips={tips.imageInput} width={260}>
      <div className="flex flex-wrap gap-1">
        {ROLES.map(role => (
          <button
            key={role}
            className={`pill-btn ${data.role === role ? 'active-cyan' : ''}`}
            onClick={() => updateNodeData(id, { role })}
          >
            {role}
          </button>
        ))}
      </div>

      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        className={`rounded-xl border border-dashed transition-all duration-300 cursor-pointer text-center py-5 ${
          dragging
            ? 'border-cyan-400/40 bg-cyan-400/[0.06]'
            : 'border-white/[0.06] hover:border-white/10 hover:bg-white/[0.02]'
        }`}
        onClick={() => document.getElementById(`ii-${id}`).click()}
      >
        <input
          id={`ii-${id}`}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => e.target.files[0] && upload(e.target.files[0])}
        />
        {data.url
          ? <img src={data.url} alt="" className="w-full rounded-lg object-cover max-h-36 px-2" />
          : <p className="text-[10px] t-secondary font-light">Drop image or click to browse</p>
        }
      </div>

      <NodeHandle type="source" position={Position.Right} id="image" style={{ top: '50%' }} />
    </NodeShell>
  )
}
