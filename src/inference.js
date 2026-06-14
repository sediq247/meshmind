import { createQvac } from '@qvac/sdk'
import { EventEmitter } from 'events'

/**
 * MeshMind Inference Engine
 * 
 * Handles local inference via QVAC SDK and delegated inference
 * across the mesh. Streams responses back to requesters.
 */
export class MeshMindInference extends EventEmitter {
  constructor(config, mesh) {
    super()
    this.config = config
    this.mesh = mesh
    this.qvac = null
    this.model = null
    this.isReady = false
    this.pendingRequests = new Map() // requestId -> { resolve, reject, chunks: [] }
  }

  /**
   * Initialize QVAC SDK and load the default model
   */
  async init() {
    try {
      this.qvac = await createQvac()
      console.log('[Inference] QVAC SDK initialized')

      // Load default model if available
      const modelPath = this.config.inference?.defaultModel
      if (modelPath) {
        this.model = await this.qvac.loadModel(modelPath, {
          contextSize: this.config.inference?.contextSize || 4096,
          gpuLayers: this.config.inference?.gpuLayers || 0
        })
        console.log(`[Inference] Model loaded: ${modelPath}`)
      }

      this.isReady = true
      this.emit('ready')
    } catch (err) {
      console.error('[Inference] Failed to initialize:', err.message)
      // Don't throw â€” node can still participate as a client
      this.isReady = false
    }
  }

  /**
   * Complete a prompt â€” either locally or via delegation
   */
  async complete(prompt, options = {}) {
    const requestId = this._generateId()
    const preferredModel = options.model || this.config.inference?.defaultModel

    // Try local first if capable
    if (this.isReady && this.model) {
      return this._completeLocal(prompt, options, requestId)
    }

    // Delegate to best peer
    const bestPeer = this.mesh.findBestPeer(preferredModel)
    if (!bestPeer) {
      throw new Error('No capable peer found for inference. Mesh may be empty.')
    }

    console.log(`[Inference] Delegating request ${requestId} to peer: ${bestPeer}`)
    return this._delegateInference(bestPeer, prompt, options, requestId)
  }

  /**
   * Stream a completion â€” returns an async iterator
   */
  async *stream(prompt, options = {}) {
    const requestId = this._generateId()
    const preferredModel = options.model || this.config.inference?.defaultModel

    if (this.isReady && this.model) {
      yield* this._streamLocal(prompt, options, requestId)
      return
    }

    const bestPeer = this.mesh.findBestPeer(preferredModel)
    if (!bestPeer) {
      throw new Error('No capable peer found for streaming inference.')
    }

    yield* this._delegateStream(bestPeer, prompt, options, requestId)
  }

  /**
   * Handle an incoming inference request from a peer
   */
  async handleRemoteRequest(request) {
    const { requestId, prompt, options, from } = request

    if (!this.isReady || !this.model) {
      this.mesh.sendTo(from, {
        type: 'INFERENCE_ERROR',
        requestId,
        error: 'This node cannot perform inference (no model loaded)'
      })
      return
    }

    try {
      const stream = this.qvac.createCompletion(this.model, {
        prompt,
        maxTokens: options.maxTokens || this.config.inference?.maxTokens || 512,
        temperature: options.temperature || this.config.inference?.temperature || 0.7,
        stream: true
      })

      for await (const chunk of stream) {
        this.mesh.sendTo(from, {
          type: 'INFERENCE_CHUNK',
          requestId,
          content: chunk.content || chunk.text || '',
          done: chunk.done || false
        })
      }

      this.mesh.sendTo(from, {
        type: 'INFERENCE_END',
        requestId,
        stats: { tokensGenerated: stream.tokensGenerated || 0 }
      })
    } catch (err) {
      console.error(`[Inference] Remote request ${requestId} failed:`, err.message)
      this.mesh.sendTo(from, {
        type: 'INFERENCE_ERROR',
        requestId,
        error: err.message
      })
    }
  }

  /**
   * Handle incoming inference responses (chunks, end, error)
   */
  handleRemoteResponse(response) {
    const { requestId, type } = response
    const pending = this.pendingRequests.get(requestId)
    if (!pending) return

    switch (type) {
      case 'INFERENCE_CHUNK':
        pending.chunks.push(response.content)
        if (pending.onChunk) pending.onChunk(response.content)
        break

      case 'INFERENCE_END':
        pending.resolve({
          text: pending.chunks.join(''),
          stats: response.stats
        })
        this.pendingRequests.delete(requestId)
        break

      case 'INFERENCE_ERROR':
        pending.reject(new Error(response.error))
        this.pendingRequests.delete(requestId)
        break
    }
  }

  // â”€â”€â”€ Private Methods â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async _completeLocal(prompt, options, requestId) {
    const result = await this.qvac.createCompletion(this.model, {
      prompt,
      maxTokens: options.maxTokens || this.config.inference?.maxTokens || 512,
      temperature: options.temperature || this.config.inference?.temperature || 0.7
    })

    return {
      text: result.text || result.content || '',
      stats: { tokensGenerated: result.tokensGenerated || 0 },
      local: true
    }
  }

  async *_streamLocal(prompt, options, requestId) {
    const stream = this.qvac.createCompletion(this.model, {
      prompt,
      maxTokens: options.maxTokens || this.config.inference?.maxTokens || 512,
      temperature: options.temperature || this.config.inference?.temperature || 0.7,
      stream: true
    })

    for await (const chunk of stream) {
      yield {
        content: chunk.content || chunk.text || '',
        done: chunk.done || false
      }
    }
  }

  async _delegateInference(peerId, prompt, options, requestId) {
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject, chunks: [] })

      this.mesh.sendTo(peerId, {
        type: 'INFERENCE_REQUEST',
        requestId,
        prompt,
        options,
        from: this.config.nodeId,
        timestamp: Date.now()
      })

      // Timeout after 60s
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId)
          reject(new Error('Inference request timed out'))
        }
      }, 60000)
    })
  }

  async *_delegateStream(peerId, prompt, options, requestId) {
    const chunks = []
    let done = false
    let error = null

    this.pendingRequests.set(requestId, {
      chunks,
      onChunk: (c) => { chunks.push(c) },
      resolve: () => { done = true },
      reject: (e) => { error = e; done = true }
    })

    this.mesh.sendTo(peerId, {
      type: 'INFERENCE_REQUEST',
      requestId,
      prompt,
      options,
      from: this.config.nodeId,
      timestamp: Date.now()
    })

    // Yield chunks as they arrive
    let yielded = 0
    const timeout = Date.now() + 60000

    while (!done && Date.now() < timeout) {
      while (yielded < chunks.length) {
        yield { content: chunks[yielded] }
        yielded++
      }
      await new Promise(r => setTimeout(r, 10))
    }

    if (error) throw error
    if (!done) throw new Error('Stream timed out')

    this.pendingRequests.delete(requestId)
  }

  _generateId() {
    return `inf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}
