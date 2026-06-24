import { create } from 'zustand'

const STORAGE_KEY = 'ai-node-studio-projects'

function loadProjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persistProjects(projects) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
  } catch { }
}

export const useProjectStore = create((set, get) => ({
  projects: loadProjects(),

  saveProject: ({ nodes, edges, name }) => {
    const outputUrls = nodes
      .filter(n => n.data?.outputUrl || n.data?.url)
      .map(n => n.data.outputUrl || n.data.url)
      .filter(Boolean)

    const prompt = nodes
      .find(n => n.type === 'promptBuilder' || n.type === 'videoGen' || n.type === 'imageGen')
      ?.data?.prompt || ''

    const models = nodes
      .filter(n => n.data?.model)
      .map(n => n.data.model)

    const project = {
      id: `proj-${Date.now()}`,
      name: name || prompt.slice(0, 50) || `Project ${new Date().toLocaleDateString()}`,
      timestamp: Date.now(),
      nodes: nodes.map(n => ({ ...n, selected: false, dragging: false })),
      edges,
      preview: outputUrls[0] || null,
      outputUrls,
      models: [...new Set(models)],
      promptSnippet: prompt.slice(0, 80),
    }

    set(state => {
      const next = [project, ...state.projects].slice(0, 50)
      persistProjects(next)
      return { projects: next }
    })

    return project
  },

  deleteProject: (id) => {
    set(state => {
      const next = state.projects.filter(p => p.id !== id)
      persistProjects(next)
      return { projects: next }
    })
  },

  renameProject: (id, name) => {
    set(state => {
      const next = state.projects.map(p => p.id === id ? { ...p, name } : p)
      persistProjects(next)
      return { projects: next }
    })
  },
}))
