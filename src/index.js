import fs from 'fs/promises'
import { MeshMindMesh } from './mesh.js'
import { MeshMindInference } from './inference.js'
import { MeshMindRAG } from './rag.js'
import { MeshMindModels } from './models.js'
import { MeshMindDashboard } from './dashboard.js'

async function main() {
  let config = {}
  try {
    const configRaw = await fs.readFile('./config.json', 'utf8')
    config = JSON.parse(configRaw)
  } catch (err) {
    console.warn('[Main] Could not load config.json, using defaults')
    config = {
      nodeId: 'meshmind-' + Math.random().toString(36).slice(2, 8),
      gpu: false,
      mesh: { topic: 'meshmind-offline-ai-v1', heartbeatInterval: 5000, peerTimeout: 15000 },
      dashboard: { port: 3000, host: '0.0.0.0' }
    }
  }

  if (process.env.NODE_ID) config.nodeId = process.env.NODE_ID
  if (process.env.GPU) config.gpu = process.env.GPU === 'true'
  if (process.env.GPU_LAYERS) config.inference = { ...config.inference, gpuLayers: parseInt(process.env.GPU_LAYERS) }
  if (process.env.PORT) config.dashboard = { ...config.dashboard, port: parseInt(process.env.PORT) }

  console.log('========================================')
  console.log('  MESHMIND - P2P Distributed AI Mesh')
  console.log('  QVAC Hackathon I - Unleash Edge AI')
  console.log('========================================')
  console.log('  Node: ' + config.nodeId)
  console.log('  GPU:  ' + (config.gpu ? 'YES' : 'NO'))
  console.log('  Port: ' + (config.dashboard?.port || 3000))
  console.log('========================================')

  const mesh = new MeshMindMesh(config)
  const inference = new MeshMindInference(config, mesh)
  const rag = new MeshMindRAG(config, mesh)
  const models = new MeshMindModels(config, mesh)
  const dashboard = new MeshMindDashboard(config, mesh, inference, rag, models)

  mesh.on('inference:request', (req) => {
    inference.handleRemoteRequest(req)
  })

  mesh.on('inference:response', (res) => {
    inference.handleRemoteResponse(res)
  })

  mesh.on('model:query', () => {
    models.announce()
  })

  mesh.on('model:available', (msg) => {
    models.handleRemoteAvailable(msg)
  })

  mesh.on('rag:sync', (msg) => {
    rag.handleRemoteSync(msg)
  })

  try {
    await mesh.start()
    await inference.init()
    await rag.init()
    await models.scanLocal()
    models.announce()
    await dashboard.start()

    console.log('[Main] MeshMind fully operational')
    console.log('[Main] Press Ctrl+C to stop')

    setInterval(() => models.announce(), 30000)
    setTimeout(() => models.queryMesh(), 5000)

  } catch (err) {
    console.error('[Main] Failed to start:', err.message)
    process.exit(1)
  }

  process.on('SIGINT', async () => {
    console.log('\n[Main] Shutting down MeshMind...')
    try { await dashboard.stop() } catch {}
    try { await inference.destroy() } catch {}
    try { await rag.destroy() } catch {}
    try { await mesh.stop() } catch {}
    console.log('[Main] Goodbye')
    process.exit(0)
  })
}

main().catch(err => {
  console.error('[Main] Fatal error:', err)
  process.exit(1)
})
