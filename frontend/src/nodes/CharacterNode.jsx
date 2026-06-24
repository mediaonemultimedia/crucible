import { useCallback, useEffect, useState } from 'react'
import { Position, useReactFlow } from '@xyflow/react'
import { User, Loader2, Plus } from 'lucide-react'
import NodeShell from '../components/NodeShell'
import NodeHandle from '../components/NodeHandle'
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
    <NodeShell id={id} label="Character" icon={<User size={13} />} color="#ec4899" status={data.status} tips={tips.characterNode} width={280}>
      <NodeHandle type="target" position={Position.Left} id="face_in" style={{ top: '50%' }} />

      {characters.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] t-tertiary uppercase tracking-wider font-medium">Saved Characters</p>
          {characters.map(c => (
            <button
              key={c.id}
              onClick={() => updateNodeData(id, { characterId: c.id, characterName: c.name })}
              className="w-full text-left px-3 py-2 rounded-xl text-[11px] transition-all duration-200"
              style={{
                background: data.characterId === c.id ? 'rgba(236,72,153,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${data.characterId === c.id ? 'rgba(236,72,153,0.25)' : 'rgba(255,255,255,0.04)'}`,
                color: data.characterId === c.id ? 'rgba(236,72,153,0.8)' : 'var(--text-tertiary)',
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="pt-2 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <p className="text-[9px] t-tertiary uppercase tracking-wider font-medium">Create New Character</p>
        <p className="text-[9px] t-tertiary font-light">Connect 3-5 Image Input nodes (Role: Face) then name and create.</p>
        <input
          type="text"
          placeholder="Character name..."
          className="glass-input w-full px-3 py-2 text-[11px]"
          value={newName}
          onChange={e => setNewName(e.target.value)}
        />
        <button onClick={createCharacter} disabled={creating || !newName}
          className="action-btn"
          style={{ background: 'rgba(236,72,153,0.08)', borderColor: 'rgba(236,72,153,0.2)', color: 'rgba(236,72,153,0.8)' }}>
          {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          {creating ? 'Training...' : 'Create Character'}
        </button>
      </div>

      {data.characterName && (
        <p className="text-[9px] font-light" style={{ color: 'rgba(236,72,153,0.45)' }}>Active: {data.characterName}</p>
      )}

      <NodeHandle type="source" position={Position.Right} id="character_out" style={{ top: '50%' }} />
    </NodeShell>
  )
}
