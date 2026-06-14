import fs from 'fs/promises'
import path from 'path'

/**
 * MeshMind Model Registry
 * 
 * Manages local models, handles P2P model discovery and fetching,
 * and tracks which models are available across the mesh.
 */
export class MeshMindModels {
  constructor(config, mesh) {
    this.config = config
    this.mesh = mesh
    this.localModels = new Map() // modelId -> { path, size, hash, loaded }
    this.meshModels = new Map()  // modelId -> Set(peerIds)
    this.downloads = new Map()   // modelId -> { progress, chunks: [] }
  }

  /**
   * Scan local models directory and register available models
   */
  async scanLocal() {
    const modelsDir = './models'
    try {
      const files = await fs.readdir(modelsDir)
      for (const file of files) {
        if (file.endsWith('.gguf') || file.endsWith('.bin') || file.endsWith('.onnx')) {
          const filePath = path.join(modelsDir, file)
          const stat = await fs.stat(filePath)
          const modelId = file.replace(/\.[^.]+$/, '')

          this.localModels.set(modelId, {
            path: filePath,
            size: stat.size,
            loaded: this.config.models?.localModels?.[modelId] === filePath,
            format: path.extname(file).slice(1)
          })

          console.log(`[Models] Registered local model: ${modelId} (${this._formatSize(stat.size)})`)
        }
      }
    } catch (err) {
      console.log('[Models] No models directory found, creating...')
      await fs.mkdir(modelsDir, { recursive: true })
    }
  }

  /**
   * Query the mesh for available models
   */
  async queryMesh() {
    this.mesh.broadcast({
      type: 'MODEL_QUERY',
      nodeId: this.config.nodeId,
      timestamp: Date.now()
    })
  }

  /**
   * Announce local models to the mesh
   */
  announce() {
    const available = []
    for (const [modelId, info] of this.localModels) {
      available.push({
        modelId,
        size: info.size,
        format: info.format,
        loaded: info.loaded
      })
    }

    if (available.length > 0) {
      this.mesh.broadcast({
        type: 'MODEL_AVAILABLE',
        nodeId: this.config.nodeId,
        models: available,
        timestamp: Date.now()
      })
      console.log(`[Models] Announced ${available.length} models to mesh`)
    }
  }

  /**
   * Handle incoming model availability from a peer
   */
  handleRemoteAvailable(msg) {
    const { from, models } = msg

    for (const model of models) {
      if (!this.meshModels.has(model.modelId)) {
        this.meshModels.set(model.modelId, new Set())
      }
      this.meshModels.get(model.modelId).add(from)
    }

    console.log(`[Models] Peer ${from} has ${models.length} models available`)
  }

  /**
   * Check if a model is available anywhere in the mesh
   */
  isAvailable(modelId) {
    return this.localModels.has(modelId) || this.meshModels.has(modelId)
  }

  /**
   * Get the best peer to fetch a model from
   */
  getBestSource(modelId) {
    const peers = this.meshModels.get(modelId)
    if (!peers || peers.size === 0) return null

    // Return first available peer (could be enhanced with bandwidth scoring)
    return Array.from(peers)[0]
  }

  /**
   * Get model info for dashboard
   */
  getModelInfo() {
    const local = []
    for (const [id, info] of this.localModels) {
      local.push({ id, ...info, source: 'local' })
    }

    const remote = []
    for (const [id, peers] of this.meshModels) {
      if (!this.localModels.has(id)) {
        remote.push({ id, peers: peers.size, source: 'mesh' })
      }
    }

    return { local, remote, total: local.length + remote.length }
  }

  // â”€â”€â”€ Private Methods â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _formatSize(bytes) {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
  }
}
