import { useCallback, useState } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { Image } from 'lucide-react'
import NodeShell from '../components/NodeShell'
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
    <NodeShell label="Image Input" icon={<Image size={14} />} color="#06b6d4" status={data.status} tips={tips.imageInput} width={260}>
      {/* Role selector */}
      <div className="flex flex-wrap gap-1">
        {ROLES.map(role => (
          <button
            key={role}
            onClick={() => updateNodeData(id, { role })}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
              data.role === role
                ? 'border-cyan-400 bg-cyan-400/15 text-cyan-300'
                : 'border-nodeborder text-zinc-500 hover:border-zinc-500'
            }`}
          >
            {role}
          </button>
        ))}
      </div>

      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        className={`rounded-lg border-2 border-dashed transition-colors cursor-pointer text-center py-4 ${
          dragging ? 'border-cyan-400 bg-cyan-400/10' : 'border-nodeborder hover:border-cyan-400/50'
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
          ? <img src={data.url} alt="" className="w-full rounded object-cover max-h-36" />
          : <p className="text-xs text-zinc-500">Drop image or click to browse</p>
        }
      </div>

      <Handle type="source" position={Position.Right} id="image" style={{ top: '50%' }} />
    </NodeShell>
  )
}
