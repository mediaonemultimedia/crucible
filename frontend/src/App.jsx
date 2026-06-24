import { useCallback, useEffect, useRef } from 'react'
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
  useReactFlow,
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
import { useThemeStore } from './stores/themeStore'
import { useProjectStore } from './stores/projectStore'

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

const EMPTY_OUTPUT_NODE = {
  id: 'output-1', type: 'output', position: { x: 400, y: 200 },
  data: {},
}

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
  const theme = useThemeStore(s => s.theme)
  const saveProject = useProjectStore(s => s.saveProject)
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const reactFlowWrapper = useRef(null)
  const prevNodesRef = useRef(nodes)
  const { onConnect: onConnectSync } = useEdgeDataSync()
  const { fitView } = useReactFlow()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Auto-save when a generation completes (status transitions to 'done')
  useEffect(() => {
    const prev = prevNodesRef.current
    for (const node of nodes) {
      if (node.data?.status === 'done') {
        const prevNode = prev.find(n => n.id === node.id)
        if (prevNode && prevNode.data?.status !== 'done') {
          saveProject({ nodes, edges })
          break
        }
      }
    }
    prevNodesRef.current = nodes
  }, [nodes, edges, saveProject])

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
    const position = {
      x: e.clientX - bounds.left - 140,
      y: e.clientY - bounds.top - 40,
    }

    const id = `node-${++nodeIdCounter}`
    setNodes(nds => [...nds, { id, type, position, data: { status: 'idle' } }])
  }, [setNodes])

  const handleNewProject = useCallback(() => {
    setNodes([EMPTY_OUTPUT_NODE])
    setEdges([])
    setTimeout(() => fitView({ padding: 0.5 }), 50)
  }, [setNodes, setEdges, fitView])

  const handleLoadProject = useCallback((project) => {
    setNodes(project.nodes)
    setEdges(project.edges)
    nodeIdCounter = Math.max(nodeIdCounter, ...project.nodes.map(n => {
      const m = n.id.match(/\d+/)
      return m ? parseInt(m[0], 10) : 0
    })) + 1
    setTimeout(() => fitView({ padding: 0.15 }), 50)
  }, [setNodes, setEdges, fitView])

  return (
    <div className="flex h-screen w-screen">
      <Sidebar onNewProject={handleNewProject} onLoadProject={handleLoadProject} />
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
          defaultEdgeOptions={{ animated: true, style: { stroke: 'var(--edge-color)', strokeWidth: 1.5 } }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Lines}
            gap={32}
            lineWidth={0.5}
            color="var(--canvas-grid)"
          />
          <Controls />
          <MiniMap
            nodeColor={n => {
              const colors = { videoInput: '#6366f1', imageInput: '#06b6d4', subjectTagger: '#8b5cf6',
                promptBuilder: '#f59e0b', imageGen: '#10b981', videoGen: '#f97316', character: '#ec4899', output: '#22d3a0' }
              return colors[n.type] || '#888'
            }}
            maskColor="var(--minimap-mask)"
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
