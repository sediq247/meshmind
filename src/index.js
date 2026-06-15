import fs from 'fs/promises'
import { MeshMindMesh } from './mesh.js'
import { MeshMindInference } from './inference.js'
import { MeshMindRAG } from './rag.js'
import { MeshMindModels } from './models.js'
import { MeshMindDashboard } from './dashboard.js'

/**
 * MeshMind — P2P Distributed AI Mesh for Offline Communities
 * 
 * Main entry point. Initializes all subsystems and wires them together.
 */
async function main() {
  // Load config
  let config = {}
  try {
    const configRaw = await fs.readFile('./config.json', 'utf8')
    config = JSON.parse(configRaw)
  } catch (err) {
    console.warn('[Main] Could not load config.json, using defaults')
    config = {
      nodeId: `meshmind-${Math.random().toString(36).slice(2, 8)}`,
      gpu: false,
      mesh: { topic: 'meshmind-offline-ai-v1', heartbeatInterval: 5000, peerTimeout: 15000 },
      dashboard: { port: 3000, host: '0.0.0.0' }
    }
  }

  // Override with env vars (for demo script)
  if (process.env.NODE_ID) config.nodeId = process.env.NODE_ID
  if (process.env.GPU) config.gpu = process.env.GPU === 'true'
  if (process.env.GPU_LAYERS) config.inference = { ...config.inference, gpuLayers: parseInt(process.env.GPU_LAYERS) }
  if (process.env.PORT) config.dashboard = { ...config.dashboard, port: parseInt(process.env.PORT) }

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🧠 MESHMIND — P2P Distributed AI Mesh                        ║
║   QVAC Hackathon I — Unleash Edge AI                          ║
║                                                               ║
║   Node: ${config.nodeId.padEnd(51)} ║
║   GPU:  ${(config.gpu ? 'YES' : 'NO').padEnd(51)} ║
║   Port: ${(config.dashboard?.port || 3000).toString().padEnd(51)} ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`)

  // ─── Initialize Subsystems ─────────────────────────────────────

  // 1. Mesh (P2P networking)
  const mesh = new MeshMindMesh(config)

  // 2. Inference engine
  const inference = new MeshMindInference(config, mesh)

  // 3. RAG engine
  const rag = new MeshMindRAG(config, mesh)

  // 4. Model registry
  const models = new MeshMindModels(config, mesh)

  // 5. Dashboard
  const dashboard = new MeshMindDashboard(config, mesh, inference, rag, models)

  // ─── Wire Up Event Handlers ────────────────────────────────────

  // Mesh events -> Inference
  mesh.on('inference:request', (req) => {
    inference.handleRemoteRequest(req)
  })

  mesh.on('inference:response', (res) => {
    inference.handleRemoteResponse(res)
  })

  // Mesh events -> Models
  mesh.on('model:query', () => {
    models.announce()
  })

  mesh.on('model:available', (msg) => {
    models.handleRemoteAvailable(msg)
  })

  // Mesh events -> RAG
  mesh.on('rag:sync', (msg) => {
    rag.handleRemoteSync(msg)
  })

  // ─── Start Everything ────────────────────────────────────────

  try {
    await mesh.start()
    await inference.init()
    await rag.init()
    await models.scanLocal()
    models.announce()
    await dashboard.start()

    console.log('[Main] ✅ MeshMind fully operational')
    console.log('[Main] Press Ctrl+C to stop')

    // Announce models periodically
    setInterval(() => models.announce(), 30000)

    // Query mesh for models on startup
    setTimeout(() => models.queryMesh(), 5000)

  } catch (err) {
    console.error('[Main] ❌ Failed to start:', err.message)
    process.exit(1)
  }

  // ─── Graceful Shutdown ────────────────────────────────────────

  process.on('SIGINT', async () => {
    console.log('
[Main] 🛑 Shutting down MeshMind...')
    await dashboard.stop()
    await mesh.stop()
    console.log('[Main] 👋 Goodbye')
    process.exit(0)
  })
}

main().catch(err => {
  console.error('[Main] Fatal error:', err)
  process.exit(1)
})
