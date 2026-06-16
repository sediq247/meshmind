import { loadModel, completion, unloadModel, isMock } from './qvac-sdk-mock.js'
import { EventEmitter } from 'events'

/**
 * MeshMind Inference Engine
 * 
 * Uses QVAC SDK (or mock fallback) for on-device inference and mesh delegation.
 */
export class MeshMindInference extends EventEmitter {
  constructor(config, mesh) {
    super()
    this.config = config
    this.mesh = mesh
    this.modelId = null
    this.modelPath = null
    this.isReady = false
    this.pendingRequests = new Map()
  }

  async init() {
    const modelPath = this.config.inference?.defaultModel
    if (!modelPath) {
      console.log(`[Inference] ${this.config.nodeId}: No model configured, acting as client`)
      this.isReady = false
      return
    }

    try {
      this.modelId = await loadModel({
        modelSrc: modelPath,
        modelType: 'llm',
        onProgress: (p) => {
          if (p.percent) console.log(`[Inference] Loading model: ${p.percent}%`)
        }
      })
      this.modelPath = modelPath
      this.isReady = true
      this.emit('ready')
      console.log(`[Inference] ${this.config.nodeId}: Model loaded — ${modelPath}${isMock ? ' (MOCK)' : ''}`)
    } catch (err) {
      console.error(`[Inference] ${this.config.nodeId}: Failed to load model:`, err.message)
      this.isReady = false
    }
  }

  async complete(prompt, options = {}) {
    const requestId = this._generateId()
    if (this.isReady && this.modelId) {
      return this._completeLocal(prompt, options, requestId)
    }
    const bestPeer = this.mesh.findBestPeer()
    if (!bestPeer) {
      throw new Error('No capable peer found for inference. Mesh may be empty.')
    }
    console.log(`[Inference] Delegating request ${requestId} to peer: ${bestPeer}`)
    return this._delegateInference(bestPeer, prompt, options, requestId)
  }

  async *stream(prompt, options = {}) {
    const requestId = this._generateId()
    if (this.isReady && this.modelId) {
      yield* this._streamLocal(prompt, options, requestId)
      return
    }
    const bestPeer = this.mesh.findBestPeer()
    if (!bestPeer) {
      throw new Error('No capable peer found for streaming inference.')
    }
    yield* this._delegateStream(bestPeer, prompt, options, requestId)
  }

  async handleRemoteRequest(request) {
    const { requestId, prompt, options, from } = request
    if (!this.isReady || !this.modelId) {
      this.mesh.sendTo(from, {
        type: 'INFERENCE_ERROR',
        requestId,
        error: 'This node cannot perform inference (no model loaded)'
      })
      return
    }
    try {
      const history = [{ role: 'user', content: prompt }]
      const result = completion({
        modelId: this.modelId,
        history,
        stream: true,
        maxTokens: options.maxTokens || this.config.inference?.maxTokens || 512,
        temperature: options.temperature || this.config.inference?.temperature || 0.7
      })
      for await (const token of result.tokenStream) {
        this.mesh.sendTo(from, {
          type: 'INFERENCE_CHUNK',
          requestId,
          content: token,
          done: false
        })
      }
      this.mesh.sendTo(from, {
        type: 'INFERENCE_END',
        requestId,
        stats: { tokensGenerated: result.tokensGenerated || 0 }
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

  async destroy() {
    if (this.modelId) {
      try {
        await unloadModel({ modelId: this.modelId })
        console.log(`[Inference] ${this.config.nodeId}: Model unloaded`)
      } catch (err) {
        console.error(`[Inference] Failed to unload model:`, err.message)
      }
    }
  }

  async _completeLocal(prompt, options, requestId) {
    const history = [{ role: 'user', content: prompt }]
    const result = completion({
      modelId: this.modelId,
      history,
      stream: false,
      maxTokens: options.maxTokens || this.config.inference?.maxTokens || 512,
      temperature: options.temperature || this.config.inference?.temperature || 0.7
    })
    const text = await result.text
    return {
      text,
      stats: { tokensGenerated: text?.length || 0 },
      local: true
    }
  }

  async *_streamLocal(prompt, options, requestId) {
    const history = [{ role: 'user', content: prompt }]
    const result = completion({
      modelId: this.modelId,
      history,
      stream: true,
      maxTokens: options.maxTokens || this.config.inference?.maxTokens || 512,
      temperature: options.temperature || this.config.inference?.temperature || 0.7
    })
    for await (const token of result.tokenStream) {
      yield { content: token, done: false }
    }
    yield { content: '', done: true }
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
