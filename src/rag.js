import { createQvac } from '@qvac/sdk'

/**
 * MeshMind Distributed RAG Engine
 * 
 * Handles local document ingestion, embedding generation,
 * semantic search, and mesh-wide knowledge base sync.
 */
export class MeshMindRAG {
  constructor(config, mesh) {
    this.config = config
    this.mesh = mesh
    this.qvac = null
    this.embedModel = null
    this.documents = new Map() // docId -> { chunks: [], embeddings: [] }
    this.vectorIndex = [] // Array of { embedding, docId, chunkIndex }
    this.isReady = false
  }

  /**
   * Initialize QVAC embedding model
   */
  async init() {
    try {
      this.qvac = await createQvac()
      const embPath = this.config.rag?.embeddingModel
      if (embPath) {
        this.embedModel = await this.qvac.loadModel(embPath, {
          contextSize: 512,
          gpuLayers: this.config.gpu ? 10 : 0
        })
        console.log(`[RAG] Embedding model loaded: ${embPath}`)
      }
      this.isReady = true
    } catch (err) {
      console.error('[RAG] Failed to initialize:', err.message)
      this.isReady = false
    }
  }

  /**
   * Add a document to the local knowledge base
   */
  async addDocument(docId, text, metadata = {}) {
    if (!this.isReady || !this.embedModel) {
      throw new Error('RAG engine not initialized')
    }

    // Chunk the document
    const chunks = this._chunkText(text)
    const embeddings = []

    for (const chunk of chunks) {
      const emb = await this.qvac.createEmbeddings(this.embedModel, chunk)
      embeddings.push(emb)
      this.vectorIndex.push({
        embedding: emb,
        docId,
        chunkIndex: embeddings.length - 1,
        text: chunk
      })
    }

    this.documents.set(docId, {
      chunks,
      embeddings,
      metadata,
      addedAt: Date.now()
    })

    // Sync with mesh
    this._syncToMesh(docId, chunks, embeddings, metadata)

    console.log(`[RAG] Document added: ${docId} (${chunks.length} chunks)`)
    return { docId, chunks: chunks.length }
  }

  /**
   * Semantic search across local + mesh knowledge
   */
  async search(query, options = {}) {
    if (!this.isReady || !this.embedModel) {
      throw new Error('RAG engine not initialized')
    }

    const topK = options.topK || this.config.rag?.topK || 5
    const queryEmbedding = await this.qvac.createEmbeddings(this.embedModel, query)

    // Search local index
    const localResults = this._searchIndex(queryEmbedding, topK)

    // Optionally query mesh peers for their knowledge
    const meshResults = await this._queryMeshPeers(query, topK)

    // Merge and deduplicate
    const allResults = [...localResults, ...meshResults]
    allResults.sort((a, b) => b.score - a.score)

    return allResults.slice(0, topK)
  }

  /**
   * Build a context string from search results for LLM prompting
   */
  buildContext(results) {
    if (!results || results.length === 0) return ''

    const context = results
      .map((r, i) => `[${i + 1}] ${r.text} (source: ${r.docId})`)
      .join('

')

    return `Context:
${context}

Based on the above context, answer the following question:
`
  }

  /**
   * Handle incoming RAG sync from a peer
   */
  handleRemoteSync(msg) {
    const { docId, chunks, embeddings, metadata, from } = msg

    // Store peer documents in a separate namespace
    const peerDocId = `${from}:${docId}`

    for (let i = 0; i < chunks.length; i++) {
      this.vectorIndex.push({
        embedding: embeddings[i],
        docId: peerDocId,
        chunkIndex: i,
        text: chunks[i],
        peer: from
      })
    }

    this.documents.set(peerDocId, {
      chunks,
      embeddings,
      metadata,
      peer: from,
      syncedAt: Date.now()
    })

    console.log(`[RAG] Synced document from ${from}: ${docId} (${chunks.length} chunks)`)
  }

  /**
   * Get stats about the knowledge base
   */
  getStats() {
    const localDocs = Array.from(this.documents.values()).filter(d => !d.peer)
    const meshDocs = Array.from(this.documents.values()).filter(d => d.peer)

    return {
      localDocuments: localDocs.length,
      meshDocuments: meshDocs.length,
      totalChunks: this.vectorIndex.length,
      peersContributing: new Set(meshDocs.map(d => d.peer)).size
    }
  }

  // ─── Private Methods ───────────────────────────────────────────

  _chunkText(text) {
    const chunkSize = this.config.rag?.chunkSize || 512
    const overlap = this.config.rag?.chunkOverlap || 50
    const chunks = []

    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      chunks.push(text.slice(i, i + chunkSize).trim())
    }

    return chunks.filter(c => c.length > 50)
  }

  _searchIndex(queryEmbedding, topK) {
    const scored = this.vectorIndex.map(entry => ({
      ...entry,
      score: this._cosineSimilarity(queryEmbedding, entry.embedding)
    }))

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }

  _cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  async _queryMeshPeers(query, topK) {
    // Broadcast a RAG query to all peers
    // In production, this would be more sophisticated (DHT routing, etc.)
    const peers = this.mesh.getPeers().filter(p => p.capabilities?.canRAG)

    if (peers.length === 0) return []

    // For now, return empty — mesh RAG sync is push-based via RAG_SYNC messages
    // Peers proactively share their knowledge, we don't query-pull
    return []
  }

  _syncToMesh(docId, chunks, embeddings, metadata) {
    this.mesh.broadcast({
      type: 'RAG_SYNC',
      nodeId: this.config.nodeId,
      docId,
      chunks,
      embeddings,
      metadata,
      timestamp: Date.now()
    })
  }
}
