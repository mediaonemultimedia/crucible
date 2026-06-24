import { Handle } from '@xyflow/react'

const HANDLE_COLORS = {
  video:          '#6366f1',
  video_in:       '#6366f1',
  video_out:      '#6366f1',
  motion_video_in:'#6366f1',

  image:          '#06b6d4',
  image_in:       '#06b6d4',
  image_out:      '#06b6d4',
  char_image_in:  '#06b6d4',
  face_in:        '#06b6d4',
  frame_out:      '#06b6d4',

  prompt:         '#f59e0b',
  prompt_in:      '#f59e0b',
  prompt_out:     '#f59e0b',
  context_in:     '#f59e0b',
  camera_in:      '#e879f9',
  camera_prompt:  '#e879f9',

  subjects:       '#8b5cf6',
  character_out:  '#ec4899',
  media_in:       '#22d3a0',
}

export default function NodeHandle({ type, position, id, style }) {
  const color = HANDLE_COLORS[id] || '#6e8efb'

  return (
    <Handle
      type={type}
      position={position}
      id={id}
      style={{
        ...style,
        width: 10,
        height: 10,
        background: color,
        border: `2px solid ${color}`,
        borderRadius: '50%',
        boxShadow: `0 0 6px ${color}60`,
      }}
    />
  )
}
