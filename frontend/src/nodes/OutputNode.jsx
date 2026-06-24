import { Position } from '@xyflow/react'
import { Download, ExternalLink, MonitorPlay } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import NodeHandle from '../components/NodeHandle'
import { tips } from '../tips/nodeTips'

export default function OutputNode({ id, data }) {
  const url = data.url

  return (
    <NodeShell id={id} label="Output" icon={<MonitorPlay size={13} />} color="#22d3a0" status={url ? 'done' : 'idle'} tips={tips.output} width={300}>
      <NodeHandle type="target" position={Position.Left} id="media_in" style={{ top: '50%' }} />

      {!url && (
        <div className="py-8 text-center t-tertiary text-[10px] font-light">
          Connect a Video Gen or Image Gen node to preview output here.
        </div>
      )}

      {url && url.match(/\.(mp4|webm|mov)$/i) && (
        <video src={url} className="w-full rounded-xl" controls loop />
      )}

      {url && url.match(/\.(jpg|jpeg|png|webp|gif)$/i) && (
        <img src={url} alt="Output" className="w-full rounded-xl" />
      )}

      {url && (
        <div className="flex gap-2">
          <a href={url} download
            className="action-btn flex-1"
            style={{ background: 'rgba(34,211,160,0.06)', borderColor: 'rgba(34,211,160,0.15)', color: 'rgba(34,211,160,0.7)', padding: '6px 12px', fontSize: '11px' }}>
            <Download size={11} /> Download
          </a>
          <a href={url} target="_blank" rel="noreferrer"
            className="glass-btn flex items-center justify-center px-3 py-1.5 rounded-xl"
            style={{ color: 'var(--text-secondary)' }}>
            <ExternalLink size={11} />
          </a>
        </div>
      )}
    </NodeShell>
  )
}
