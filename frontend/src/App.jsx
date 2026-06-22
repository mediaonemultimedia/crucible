import { useCallback, useRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import Sidebar from './components/Sidebar'
import VideoInputNode from './nodes/VideoInputNode'
import ImageInputNode from './nodes/ImageInputNode'
import SubjectTaggerNode from './nodes/SubjectTaggerNode'
import PromptBuilderNode from './nodes/PromptBuilderNode'
import CameraControlsNode from './nodes/CameraControlsNode'
import UpscaleNode from './nodes/UpscaleNode'
import MotionTransferNode from './nodes/MotionTransferNode'
import FramePainterNode from './nodes/FramePainterNode'
import ImageGenNode from './nodes/ImageGenNode'
import VideoGenNode from './nodes/VideoGenNode'
import CharacterNode from './nodes/CharacterNode'
import OutputNode from './nodes/OutputNode'
import { useEdgeDataSync } from './hooks/useEdgeDataSync'

const nodeTypes = {
  videoInput:      VideoInputNode,
  imageInput:      ImageInputNode,
  subjectTagger:   SubjectTaggerNode,
  promptBuilder:   PromptBuilderNode,
  cameraControls:  CameraControlsNode,
  upscale:         UpscaleNode,
  motionTransfer:  MotionTransferNode,
  framePainter:    FramePainterNode,
  imageGen:        ImageGenNode,
  videoGen:      VideoGenNode,
  character:     CharacterNode,
  output:        OutputNode,
}

// Demo initial nodes showing the jacket-swap pipeline from the brief
const initialNodes = [
  {
    id: 'demo-1', type: 'videoInput', position: { x: 60, y: 120 },
    data: { label: 'Drop your source video here', status: 'idle' },
  },
  {
    id: 'demo-2', type: 'subjectTagger', position: { x: 360, y: 80 },
    data: { status: 'idle', subjects: [] },
  },
  {
    id: 'demo-3', type: 'imageInput', position: { x: 60, y: 380 },
    data: { label: 'Drop jacket image here', status: 'idle', role: 'Clothing' },
  },
  {
    id: 'demo-4', type: 'promptBuilder', position: { x: 360, y: 320 },
    data: {
      prompt: 'The subject is now wearing the jacket shown in the reference image. Keep their face, posture and background identical. Smooth, realistic clothing integration.',
      negativePrompt: 'blurry, flickering, morphing, distorted body, watermark',
    },
  },
  {
    id: 'demo-5', type: 'videoGen', position: { x: 700, y: 200 },
    data: { model: 'seedance-1-pro', duration: 5, enhancePrompt: true, status: 'idle' },
  },
  {
    id: 'demo-6', type: 'output', position: { x: 1060, y: 220 },
    data: {},
  },
]

const initialEdges = [
  { id: 'e1-2', source: 'demo-1', sourceHandle: 'video', target: 'demo-2', targetHandle: 'image_in', animated: true },
  { id: 'e1-5', source: 'demo-1', sourceHandle: 'video', target: 'demo-5', targetHandle: 'video_in', animated: true },
  { id: 'e3-5', source: 'demo-3', sourceHandle: 'image', target: 'demo-5', targetHandle: 'image_in', animated: true },
  { id: 'e4-5', source: 'demo-4', sourceHandle: 'prompt', target: 'demo-5', targetHandle: 'prompt_in', animated: true },
  { id: 'e5-6', source: 'demo-5', sourceHandle: 'video_out', target: 'demo-6', targetHandle: 'media_in', animated: true },
]

let nodeIdCounter = 100

function Canvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const reactFlowWrapper = useRef(null)
  const { onConnect: onConnectSync } = useEdgeDataSync()

  const onConnect = useCallback((params) => {
    setEdges(eds => addEdge({ ...params, animated: true }, eds))
    onConnectSync(params)
  }, [setEdges, onConnectSync])

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/reactflow')
    if (!type) return

    const bounds = reactFlowWrapper.current.getBoundingClientRect()
    // Use the reactflow instance to convert screen coords to flow coords
    const position = {
      x: e.clientX - bounds.left - 140,
      y: e.clientY - bounds.top - 40,
    }

    const id = `node-${++nodeIdCounter}`
    setNodes(nds => [...nds, { id, type, position, data: { status: 'idle' } }])
  }, [setNodes])

  return (
    <div className="flex h-screen w-screen">
      <Sidebar />
      <div ref={reactFlowWrapper} className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          defaultEdgeOptions={{ animated: true, style: { stroke: '#7c6aff', strokeWidth: 2 } }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#2a2a3a" />
          <Controls />
          <MiniMap
            nodeColor={n => {
              const colors = { videoInput: '#6366f1', imageInput: '#06b6d4', subjectTagger: '#8b5cf6',
                promptBuilder: '#f59e0b', imageGen: '#10b981', videoGen: '#f97316', character: '#ec4899', output: '#22d3a0' }
              return colors[n.type] || '#444'
            }}
            maskColor="rgba(15,15,19,0.7)"
          />
        </ReactFlow>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  )
}
