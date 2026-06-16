import { loadModel, unloadModel, ragSaveEmbeddings, ragSearch } from '@qvac/sdk'

/**
 * MeshMind Distributed RAG Engine
 * 
 * Uses QVAC SDK for embeddings and semantic search.
 */
export class MeshMindRAG {
  constructor(config, mesh) {
    this.config = config
    this.mesh = mesh
    this.modelId = null
    this.documents = new Map()
    this.isReady = false
  }

  async init() {
    const embPath = this.config.rag?.embeddingModel
    if (!embPath) {
      console.log(`[RAG] ${this.config.nodeId}: No embedding model configured`)
      this.isReady = false
      return
    }
    try {
      this.modelId = await loadModel({
        modelSrc: embPath,
        modelType: 'embeddings',
        onProgress: (p) => {
          if (p.percent) console.log(`[RAG] Loading embedding model: ${p.percent}%`)
        }
      })
      this.isReady = true
      console.log(`[RAG] ${this.config.nodeId}: Embedding model loaded — ${embPath}`)
    } catch (err) {
      console.error(`[RAG] ${this.config.nodeId}: Failed to load embedding model:`, err.message)
      this.isReady = false
    }
  }

  async addDocument(docId, text, metadata = {}) {
    if (!this.isReady || !this.modelId) {
      throw new Error('RAG engine not initialized')
    }
    const chunks = this._chunkText(text)
    const docs = await ragSaveEmbeddings({
      modelId: this.modelId,
      documents: chunks,
      chunk: false
    })
    this.documents.set(docId, {
      chunks,
      docs,
      metadata,
      addedAt: Date.now()
    })
    this._syncToMesh(docId, chunks, metadata)
    console.log(`[RAG] ${this.config.nodeId}: Document added — ${docId} (${chunks.length} chunks)`)
    return { docId, chunks: chunks.length }
  }

  async search(query, options = {}) {
    if (!this.isReady || !this.modelId) {
      throw new Error('RAG engine not initialized')
    }
    const topK = options.topK || this.config.rag?.topK || 5
    const results = await ragSearch({
      modelId: this.modelId,
      query,
      topK
    })
    return results.map(r => ({
      text: r.content || r.text || '',
      score: r.score || r.similarity || 0,
      docId: r.docId || 'unknown'
    }))
  }

  buildContext(results) {
    if (!results || results.length === 0) return ''
    const context = results
      .map((r, i) => `[${i + 1}] ${r.text} (source: ${r.docId})`)
      .join('\n\n')
    return `Context:\n${context}\n\nBased on the above context, answer the following question:\n`
  }

  handleRemoteSync(msg) {
    const { docId, chunks, metadata, from } = msg
    const peerDocId = `${from}:${docId}`
    this.documents.set(peerDocId, {
      chunks,
      metadata,
      peer: from,
      syncedAt: Date.now()
    })
    console.log(`[RAG] ${this.config.nodeId}: Synced document from ${from} — ${docId}`)
  }

  getStats() {
    const localDocs = Array.from(this.documents.values()).filter(d => !d.peer)
    const meshDocs = Array.from(this.documents.values()).filter(d => d.peer)
    return {
      localDocuments: localDocs.length,
      meshDocuments: meshDocs.length,
      totalChunks: localDocs.reduce((sum, d) => sum + (d.chunks?.length || 0), 0),
      peersContributing: new Set(meshDocs.map(d => d.peer)).size
    }
  }

  async destroy() {
    if (this.modelId) {
      try {
        await unloadModel({ modelId: this.modelId })
        console.log(`[RAG] ${this.config.nodeId}: Embedding model unloaded`)
      } catch (err) {
        console.error(`[RAG] Failed to unload embedding model:`, err.message)
      }
    }
  }

  _chunkText(text) {
    const chunkSize = this.config.rag?.chunkSize || 512
    const overlap = this.config.rag?.chunkOverlap || 50
    const chunks = []
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      chunks.push(text.slice(i, i + chunkSize).trim())
    }
    return chunks.filter(c => c.length > 50)
  }

  _syncToMesh(docId, chunks, metadata) {
    this.mesh.broadcast({
      type: 'RAG_SYNC',
      nodeId: this.config.nodeId,
      docId,
      chunks,
      metadata,
      timestamp: Date.now()
    })
  }
}
