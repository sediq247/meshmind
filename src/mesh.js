import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'
import crypto from 'crypto'
import { EventEmitter } from 'events'

/**
 * MeshMind P2P Mesh Protocol
 * 
 * Handles peer discovery, capability broadcasting, heartbeat,
 * and routing of inference requests across the mesh.
 */
export class MeshMindMesh extends EventEmitter {
  constructor(config) {
    super()
    this.config = config
    this.nodeId = config.nodeId
    // Use SHA-256 of topic string for consistent 32-byte topic
    this.topic = b4a.from(crypto.createHash('sha256').update(config.mesh.topic).digest())
    this.peers = new Map() // peerId -> { socket, capabilities, lastHeartbeat, buffer }
    this.swarm = null
    this.heartbeatTimer = null
    this.timeoutTimer = null
  }

  async start() {
    this.swarm = new Hyperswarm()

    this.swarm.on('connection', (socket, info) => {
      this._handleConnection(socket, info)
    })

    await this.swarm.join(this.topic, { server: true, client: true })
    await this.swarm.flush()

    console.log(`[MeshMind] Node "${this.nodeId}" joined mesh topic: ${this.config.mesh.topic}`)

    this.broadcast({
      type: 'HELLO',
      nodeId: this.nodeId,
      capabilities: this._getCapabilities(),
      timestamp: Date.now()
    })

    this.heartbeatTimer = setInterval(() => this._sendHeartbeat(), this.config.mesh.heartbeatInterval)
    this.timeoutTimer = setInterval(() => this._checkTimeouts(), this.config.mesh.peerTimeout)
  }

  async stop() {
    clearInterval(this.heartbeatTimer)
    clearInterval(this.timeoutTimer)
    for (const [peerId, peer] of this.peers) {
      try { peer.socket.destroy() } catch {}
    }
    this.peers.clear()
    await this.swarm.destroy()
    console.log('[MeshMind] Mesh stopped')
  }

  broadcast(message) {
    const data = b4a.from(JSON.stringify(message) + '\n')
    for (const [peerId, peer] of this.peers) {
      try {
        peer.socket.write(data)
      } catch (err) {
        console.error(`[MeshMind] Failed to send to ${peerId}:`, err.message)
      }
    }
  }

  sendTo(peerId, message) {
    const peer = this.peers.get(peerId)
    if (!peer) {
      throw new Error(`Peer ${peerId} not found in mesh`)
    }
    try {
      peer.socket.write(b4a.from(JSON.stringify(message) + '\n'))
    } catch (err) {
      console.error(`[MeshMind] Failed to send to ${peerId}:`, err.message)
      throw err
    }
  }

  getPeers() {
    const result = []
    for (const [peerId, peer] of this.peers) {
      result.push({
        id: peerId,
        capabilities: peer.capabilities,
        lastHeartbeat: peer.lastHeartbeat,
        latency: peer.latency || null
      })
    }
    return result
  }

  findBestPeer(preferredModel = null) {
    let bestPeer = null
    let bestScore = -Infinity

    for (const [peerId, peer] of this.peers) {
      const caps = peer.capabilities || {}
      let score = 0

      if (caps.gpu) score += 100
      score += (caps.ram || 0) / 1024 * 10
      if (preferredModel && caps.loadedModels?.includes(preferredModel)) score += 50
      score -= (peer.latency || 0) * 0.1

      if (score > bestScore) {
        bestScore = score
        bestPeer = peerId
      }
    }

    return bestPeer
  }

  _getCapabilities() {
    return {
      gpu: this.config.gpu || false,
      ram: this._getRAM(),
      gpuLayers: this.config.inference?.gpuLayers || 0,
      loadedModels: this.config.models?.localModels ? Object.keys(this.config.models.localModels) : [],
      canInfer: !!this.config.inference?.defaultModel,
      canRAG: !!this.config.rag?.embeddingModel
    }
  }

  _getRAM() {
    try {
      return Math.floor(process.memoryUsage().heapTotal / 1024 / 1024)
    } catch {
      return 4096
    }
  }

  _handleConnection(socket, info) {
    const peerId = info.publicKey ? b4a.toString(info.publicKey, 'hex').slice(0, 16) : 'unknown'

    this.peers.set(peerId, {
      socket,
      capabilities: {},
      lastHeartbeat: Date.now(),
      latency: null,
      buffer: b4a.alloc(0)
    })

    socket.on('data', (data) => {
      const peer = this.peers.get(peerId)
      if (!peer) return
      peer.buffer = b4a.concat([peer.buffer, data])
      this._tryParseMessages(peerId)
    })

    socket.on('error', (err) => {
      console.error(`[MeshMind] Socket error with ${peerId}:`, err.message)
    })

    socket.on('close', () => {
      this.peers.delete(peerId)
      this.emit('peer:left', { id: peerId })
      console.log(`[MeshMind] Peer left: ${peerId}`)
    })

    console.log(`[MeshMind] Peer connected: ${peerId}`)
  }

  _tryParseMessages(peerId) {
    const peer = this.peers.get(peerId)
    if (!peer) return

    let idx = 0
    while (idx < peer.buffer.length) {
      let end = peer.buffer.indexOf(0x0a, idx) // newline
      if (end === -1) break

      const chunk = peer.buffer.slice(idx, end)
      idx = end + 1

      try {
        const msg = JSON.parse(b4a.toString(chunk))
        this._handleMessage(msg, peerId)
      } catch (err) {
        // Invalid JSON, skip
      }
    }

    // Keep remaining unparsed data
    if (idx < peer.buffer.length) {
      peer.buffer = peer.buffer.slice(idx)
    } else {
      peer.buffer = b4a.alloc(0)
    }
  }

  _handleMessage(msg, peerId) {
    const peer = this.peers.get(peerId)
    if (!peer) return

    peer.lastHeartbeat = Date.now()

    switch (msg.type) {
      case 'HELLO':
        peer.capabilities = msg.capabilities || {}
        this.emit('peer:joined', { id: peerId, capabilities: peer.capabilities })
        console.log(`[MeshMind] Peer HELLO: ${peerId} (GPU: ${peer.capabilities.gpu}, RAM: ${peer.capabilities.ram}MB)`)
        break

      case 'HEARTBEAT':
        peer.capabilities = { ...peer.capabilities, ...msg.capabilities }
        break

      case 'INFERENCE_REQUEST':
        this.emit('inference:request', { ...msg, from: peerId })
        break

      case 'INFERENCE_CHUNK':
      case 'INFERENCE_END':
      case 'INFERENCE_ERROR':
        this.emit('inference:response', { ...msg, from: peerId })
        break

      case 'MODEL_QUERY':
        this.emit('model:query', { ...msg, from: peerId })
        break

      case 'MODEL_AVAILABLE':
        this.emit('model:available', { ...msg, from: peerId })
        break

      case 'RAG_SYNC':
        this.emit('rag:sync', { ...msg, from: peerId })
        break

      default:
        console.warn(`[MeshMind] Unknown message type: ${msg.type}`)
    }
  }

  _sendHeartbeat() {
    this.broadcast({
      type: 'HEARTBEAT',
      nodeId: this.nodeId,
      capabilities: this._getCapabilities(),
      timestamp: Date.now()
    })
  }

  _checkTimeouts() {
    const now = Date.now()
    const timeout = this.config.mesh.peerTimeout

    for (const [peerId, peer] of this.peers) {
      if (now - peer.lastHeartbeat > timeout) {
        console.log(`[MeshMind] Peer timed out: ${peerId}`)
        try { peer.socket.destroy() } catch {}
        this.peers.delete(peerId)
        this.emit('peer:left', { id: peerId })
      }
    }
  }
}
