import { useCallback, useEffect, useState } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { User, Loader2, Plus } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import { tips } from '../tips/nodeTips'

export default function CharacterNode({ id, data }) {
  const { updateNodeData } = useReactFlow()
  const [characters, setCharacters] = useState([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    fetch('/generate/characters').then(r => r.json()).then(list => setCharacters(list)).catch(() => {})
  }, [])

  const createCharacter = useCallback(async () => {
    if (!newName || !data.referenceUrls?.length) return
    setCreating(true)
    updateNodeData(id, { status: 'running' })
    try {
      const r = await fetch('/generate/character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, reference_image_urls: data.referenceUrls })
      })
      const json = await r.json()
      updateNodeData(id, { status: 'done', characterId: json.id, characterName: json.name })
      setCharacters(prev => [...prev, json])
      setNewName('')
    } catch {
      updateNodeData(id, { status: 'error' })
    } finally {
      setCreating(false)
    }
  }, [id, newName, data.referenceUrls, updateNodeData])

  return (
    <NodeShell label="Character" icon={<User size={14} />} color="#ec4899" status={data.status} tips={tips.characterNode} width={280}>
      <Handle type="target" position={Position.Left} id="face_in" style={{ top: '50%' }} />

      {/* Existing characters */}
      {characters.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Saved Characters</p>
          {characters.map(c => (
            <button
              key={c.id}
              onClick={() => updateNodeData(id, { characterId: c.id, characterName: c.name })}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                data.characterId === c.id
                  ? 'border-pink-400 bg-pink-400/15 text-pink-200'
                  : 'border-nodeborder text-zinc-400 hover:border-zinc-500'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-nodeborder/50 pt-2 space-y-1.5">
        <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Create New Character</p>
        <p className="text-[10px] text-zinc-600">Connect 3-5 Image Input nodes (Role: Face) then name and create.</p>
        <input
          type="text"
          placeholder="Character name…"
          className="w-full bg-black/30 border border-nodeborder rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-pink-500/50"
          value={newName}
          onChange={e => setNewName(e.target.value)}
        />
        <button
          onClick={createCharacter}
          disabled={creating || !newName}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-pink-600/20 border border-pink-500/30 text-pink-300 text-xs hover:bg-pink-600/30 transition-colors disabled:opacity-40"
        >
          {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          {creating ? 'Training…' : 'Create Character'}
        </button>
      </div>

      {data.characterName && (
        <p className="text-[10px] text-pink-300/70">Active: {data.characterName}</p>
      )}

      <Handle type="source" position={Position.Right} id="character_out" style={{ top: '50%' }} />
    </NodeShell>
  )
}
