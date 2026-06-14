import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyWebsocket from '@fastify/websocket'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * MeshMind Real-time Dashboard
 * 
 * Serves a web UI showing live mesh topology, peer status,
 * inference stats, RAG knowledge base, and model registry.
 * Uses WebSocket for real-time updates.
 */
export class MeshMindDashboard {
  constructor(config, mesh, inference, rag, models) {
    this.config = config
    this.mesh = mesh
    this.inference = inference
    this.rag = rag
    this.models = models
    this.server = null
    this.clients = new Set()
  }

  async start() {
    this.server = Fastify({
      logger: false
    })

    await this.server.register(fastifyStatic, {
      root: path.join(__dirname, '../public'),
      prefix: '/'
    })

    await this.server.register(fastifyWebsocket)

    // REST API endpoints
    this.server.get('/api/status', async () => this._getStatus())
    this.server.get('/api/peers', async () => this.mesh.getPeers())
    this.server.get('/api/models', async () => this.models.getModelInfo())
    this.server.get('/api/rag/stats', async () => this.rag.getStats())

    // Inference endpoint (non-streaming)
    this.server.post('/api/infer', async (request, reply) => {
      const { prompt, model, temperature, maxTokens } = request.body
      try {
        const result = await this.inference.complete(prompt, {
          model,
          temperature,
          maxTokens
        })
        return result
      } catch (err) {
        reply.code(500)
        return { error: err.message }
      }
    })

    // Inference streaming endpoint
    this.server.get('/api/infer/stream', { websocket: true }, (connection, req) => {
      connection.socket.on('message', async (message) => {
        try {
          const { prompt, model, temperature, maxTokens } = JSON.parse(message)
          const stream = this.inference.stream(prompt, {
            model,
            temperature,
            maxTokens
          })

          for await (const chunk of stream) {
            connection.socket.send(JSON.stringify({
              type: 'chunk',
              content: chunk.content,
              done: chunk.done
            }))
          }
        } catch (err) {
          connection.socket.send(JSON.stringify({
            type: 'error',
            error: err.message
          }))
        }
      })
    })

    // WebSocket for real-time dashboard updates
    this.server.get('/api/ws', { websocket: true }, (connection) => {
      this.clients.add(connection.socket)

      // Send initial state
      connection.socket.send(JSON.stringify({
        type: 'init',
        data: this._getStatus()
      }))

      connection.socket.on('close', () => {
        this.clients.delete(connection.socket)
      })
    })

    // Start broadcasting updates
    this.broadcastTimer = setInterval(() => this._broadcastUpdate(), 2000)

    const port = this.config.dashboard?.port || 3000
    const host = this.config.dashboard?.host || '0.0.0.0'

    await this.server.listen({ port, host })
    console.log(`[Dashboard] Running at http://${host}:${port}`)
  }

  async stop() {
    clearInterval(this.broadcastTimer)
    if (this.server) {
      await this.server.close()
    }
    this.clients.clear()
  }

  // â”€â”€â”€ Private Methods â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _getStatus() {
    return {
      nodeId: this.config.nodeId,
      timestamp: Date.now(),
      mesh: {
        connected: this.mesh.getPeers().length,
        peers: this.mesh.getPeers()
      },
      inference: {
        ready: this.inference?.isReady || false,
        model: this.config.inference?.defaultModel || null
      },
      rag: this.rag?.getStats() || {},
      models: this.models?.getModelInfo() || {},
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        platform: process.platform
      }
    }
  }

  _broadcastUpdate() {
    const update = JSON.stringify({
      type: 'update',
      data: this._getStatus()
    })

    for (const client of this.clients) {
      try {
        client.send(update)
      } catch {
        // Client disconnected
      }
    }
  }
}
