// When an edge connects, push the source node's output data into the target node's data
// so nodes can reference connected inputs without manual wiring by the user.
import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'

export function useEdgeDataSync() {
  const { getNode, updateNodeData } = useReactFlow()

  const onConnect = useCallback((connection) => {
    const sourceNode = getNode(connection.source)
    if (!sourceNode) return

    const { targetHandle, target } = connection
    const sourceData = sourceNode.data

    // Push file IDs and URLs to the downstream node based on the target handle
    const patch = {}

    if (targetHandle === 'image_in' || targetHandle === 'face_in') {
      if (sourceData.url) patch.referenceImageUrl = sourceData.url
      if (sourceData.fileId) patch.sourceFileId = sourceData.fileId
      if (sourceData.url) patch.imageUrl = sourceData.url
    }
    if (targetHandle === 'video_in') {
      if (sourceData.url) patch.videoUrl = sourceData.url
      if (sourceData.fileId) patch.sourceFileId = sourceData.fileId
    }
    if (targetHandle === 'prompt_in') {
      if (sourceData.prompt) patch.prompt = sourceData.prompt
      if (sourceData.negativePrompt) patch.negativePrompt = sourceData.negativePrompt
    }
    if (targetHandle === 'context_in') {
      if (sourceData.subjects) patch.context = { subjects: sourceData.subjects }
      if (sourceData.cameraPrompt) patch.cameraContext = sourceData.cameraPrompt
    }
    if (targetHandle === 'camera_in') {
      if (sourceData.cameraPrompt) patch.cameraPrompt = sourceData.cameraPrompt
    }
    if (targetHandle === 'media_in') {
      if (sourceData.outputUrl) patch.url = sourceData.outputUrl
    }
    if (targetHandle === 'character_in') {
      if (sourceData.characterId) patch.characterId = sourceData.characterId
    }
    // Motion Transfer
    if (targetHandle === 'char_image_in') {
      if (sourceData.url) patch.characterImageUrl = sourceData.url
      if (sourceData.fileId) patch.characterImageId = sourceData.fileId
      if (sourceData.outputUrl) { patch.characterImageUrl = sourceData.outputUrl; patch.characterImageId = sourceData.outputUrl }
    }
    if (targetHandle === 'motion_video_in') {
      if (sourceData.url) patch.motionVideoUrl = sourceData.url
      if (sourceData.fileId) patch.motionVideoId = sourceData.fileId
      if (sourceData.outputUrl) { patch.motionVideoUrl = sourceData.outputUrl; patch.motionVideoId = sourceData.outputUrl }
    }
    // Upscale
    if (targetHandle === 'video_in') {
      if (sourceData.url) patch.sourceVideoUrl = sourceData.url
      if (sourceData.fileId) patch.sourceVideoId = sourceData.fileId
      if (sourceData.outputUrl) { patch.sourceVideoUrl = sourceData.outputUrl; patch.sourceVideoId = sourceData.outputUrl }
    }
    // Frame Painter
    if (targetHandle === 'image_in' && sourceData.url) {
      patch.frameUrl = sourceData.url
    }

    if (Object.keys(patch).length > 0) {
      updateNodeData(target, patch)
    }
  }, [getNode, updateNodeData])

  return { onConnect }
}
