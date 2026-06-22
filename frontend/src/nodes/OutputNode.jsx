import { Handle, Position } from '@xyflow/react'
import { Download, ExternalLink, MonitorPlay } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import { tips } from '../tips/nodeTips'

export default function OutputNode({ data }) {
  const url = data.url

  return (
    <NodeShell label="Output" icon={<MonitorPlay size={14} />} color="#22d3a0" status={url ? 'done' : 'idle'} tips={tips.output} width={300}>
      <Handle type="target" position={Position.Left} id="media_in" style={{ top: '50%' }} />

      {!url && (
        <div className="py-6 text-center text-zinc-600 text-xs">
          Connect a Video Gen or Image Gen node to preview output here.
        </div>
      )}

      {url && url.match(/\.(mp4|webm|mov)$/i) && (
        <video src={url} className="w-full rounded-lg" controls loop />
      )}

      {url && url.match(/\.(jpg|jpeg|png|webp|gif)$/i) && (
        <img src={url} alt="Output" className="w-full rounded-lg" />
      )}

      {url && (
        <div className="flex gap-2">
          <a
            href={url}
            download
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-success/15 border border-success/30 text-success text-xs hover:bg-success/25 transition-colors"
          >
            <Download size={11} /> Download
          </a>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-nodeborder text-zinc-400 text-xs hover:border-zinc-500 transition-colors"
          >
            <ExternalLink size={11} />
          </a>
        </div>
      )}
    </NodeShell>
  )
}
