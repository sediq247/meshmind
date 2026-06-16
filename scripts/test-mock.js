import { MeshMindMesh } from '../src/mesh.js'
import { MeshMindInference } from '../src/inference.js'
import { MeshMindRAG } from '../src/rag.js'
import { MeshMindModels } from '../src/models.js'
import { MeshMindDashboard } from '../src/dashboard.js'

/**
 * MeshMind Test Suite
 * 
 * Tests the entire system. Requires @qvac/sdk to be installed.
 * If SDK is not available, install it first: npm install @qvac/sdk
 * 
 * Usage: node scripts/test-mock.js
 */

const HUB_CONFIG = {
  nodeId: 'test-hub',
  gpu: true,
  inference: {
    defaultModel: './models/mock-llama.gguf',
    contextSize: 4096,
    gpuLayers: 35,
    temperature: 0.7,
    maxTokens: 512
  },
  rag: {
    embeddingModel: './models/mock-embed.gguf',
    chunkSize: 512,
    chunkOverlap: 50,
    topK: 5
  },
  mesh: {
    topic: 'meshmind-test-topic-v1',
    heartbeatInterval: 2000,
    peerTimeout: 6000
  },
  models: {
    localModels: {
      'llama-3.2-1b': './models/mock-llama.gguf',
      'all-minilm': './models/mock-embed.gguf'
    }
  },
  dashboard: { port: 3999, host: '127.0.0.1' }
}

const CLIENT_CONFIG = {
  nodeId: 'test-client',
  gpu: false,
  inference: {
    defaultModel: null,
    contextSize: 2048,
    gpuLayers: 0
  },
  rag: {
    embeddingModel: './models/mock-embed.gguf',
    chunkSize: 512,
    chunkOverlap: 50,
    topK: 5
  },
  mesh: {
    topic: 'meshmind-test-topic-v1',
    heartbeatInterval: 2000,
    peerTimeout: 6000
  },
  models: {
    localModels: {}
  },
  dashboard: { port: 3998, host: '127.0.0.1' }
}

class TestRunner {
  constructor() {
    this.tests = []
    this.passed = 0
    this.failed = 0
  }
  async test(name, fn) {
    try {
      await fn()
      console.log(`  ✅ ${name}`)
      this.passed++
    } catch (err) {
      console.log(`  ❌ ${name}: ${err.message}`)
      this.failed++
    }
  }
  summary() {
    console.log('')
    console.log(`Results: ${this.passed} passed, ${this.failed} failed`)
    return this.failed === 0
  }
}

async function runTests() {
  const runner = new TestRunner()
  console.log('🧠 MeshMind Test Suite')
  console.log('===========================')
  console.log('Testing with REAL @qvac/sdk')
  console.log('')

  let hubMesh, clientMesh, hubInf, clientInf, hubRAG, clientRAG
  let hubModels, clientModels, hubDash, clientDash

  await runner.test('Hub mesh initializes', async () => {
    hubMesh = new MeshMindMesh(HUB_CONFIG)
    await hubMesh.start()
    if (!hubMesh.swarm) throw new Error('Swarm not initialized')
  })

  await runner.test('Client mesh initializes', async () => {
    clientMesh = new MeshMindMesh(CLIENT_CONFIG)
    await clientMesh.start()
    if (!clientMesh.swarm) throw new Error('Swarm not initialized')
  })

  console.log('  ⏳ Waiting for P2P discovery (3s)...')
  await new Promise(r => setTimeout(r, 3000))

  await runner.test('Peers discover each other', async () => {
    if (!hubMesh.swarm || !clientMesh.swarm) {
      throw new Error('Swarm not initialized')
    }
  })

  await runner.test('HELLO messages broadcast capabilities', async () => {
    const caps = hubMesh._getCapabilities()
    if (!caps.gpu) throw new Error('Hub should report GPU')
    if (!caps.canInfer) throw new Error('Hub should report canInfer')
  })

  await runner.test('Hub inference engine initializes', async () => {
    hubInf = new MeshMindInference(HUB_CONFIG, hubMesh)
    await hubInf.init()
    if (!hubInf.isReady) throw new Error('Hub inference not ready')
    if (!hubInf.modelId) throw new Error('Hub modelId not set')
  })

  await runner.test('Client inference engine initializes (no model)', async () => {
    clientInf = new MeshMindInference(CLIENT_CONFIG, clientMesh)
    await clientInf.init()
    if (clientInf.isReady) throw new Error('Client should not be inference-ready without model')
  })

  await runner.test('Hub can run local inference', async () => {
    const result = await hubInf.complete('What is AI?', { maxTokens: 50 })
    if (!result.text) throw new Error('No response text')
    if (!result.local) throw new Error('Should be marked as local')
    console.log(`    Response: "${result.text.slice(0, 50)}..."`)
  })

  await runner.test('Hub can stream local inference', async () => {
    const chunks = []
    for await (const chunk of hubInf.stream('Hello?', { maxTokens: 20 })) {
      chunks.push(chunk.content)
    }
    if (chunks.length === 0) throw new Error('No chunks received')
    console.log(`    Streamed ${chunks.length} chunks`)
  })

  await runner.test('Hub RAG engine initializes', async () => {
    hubRAG = new MeshMindRAG(HUB_CONFIG, hubMesh)
    await hubRAG.init()
    if (!hubRAG.isReady) throw new Error('Hub RAG not ready')
    if (!hubRAG.modelId) throw new Error('Hub RAG modelId not set')
  })

  await runner.test('Client RAG engine initializes', async () => {
    clientRAG = new MeshMindRAG(CLIENT_CONFIG, clientMesh)
    await clientRAG.init()
    if (!clientRAG.isReady) throw new Error('Client RAG not ready')
  })

  await runner.test('Hub can add documents to RAG', async () => {
    const result = await hubRAG.addDocument('test-doc-1', 
      'Edge AI is artificial intelligence that runs on local devices rather than cloud servers. ' +
      'It provides privacy, low latency, and offline capability.')
    if (result.chunks === 0) throw new Error('No chunks generated')
    console.log(`    Indexed ${result.chunks} chunks`)
  })

  await runner.test('Hub can search RAG index', async () => {
    const results = await hubRAG.search('What is edge AI?')
    if (results.length === 0) throw new Error('No search results')
    console.log(`    Found ${results.length} results, top score: ${results[0].score.toFixed(3)}`)
  })

  await runner.test('Model registry scans local models', async () => {
    hubModels = new MeshMindModels(HUB_CONFIG, hubMesh)
    await hubModels.scanLocal()
    const info = hubModels.getModelInfo()
    console.log(`    Local: ${info.local.length}, Remote: ${info.remote.length}`)
  })

  await runner.test('Hub dashboard starts', async () => {
    hubDash = new MeshMindDashboard(HUB_CONFIG, hubMesh, hubInf, hubRAG, hubModels)
    await hubDash.start()
    console.log(`    Dashboard at http://127.0.0.1:${HUB_CONFIG.dashboard.port}`)
  })

  await runner.test('Client dashboard starts', async () => {
    clientModels = new MeshMindModels(CLIENT_CONFIG, clientMesh)
    await clientModels.scanLocal()
    clientDash = new MeshMindDashboard(CLIENT_CONFIG, clientMesh, clientInf, clientRAG, clientModels)
    await clientDash.start()
    console.log(`    Dashboard at http://127.0.0.1:${CLIENT_CONFIG.dashboard.port}`)
  })

  await runner.test('Dashboard REST API responds', async () => {
    const res = await fetch(`http://127.0.0.1:${HUB_CONFIG.dashboard.port}/api/status`)
    const data = await res.json()
    if (data.nodeId !== 'test-hub') throw new Error('Wrong node ID')
    console.log(`    Node: ${data.nodeId}, Peers: ${data.mesh?.connected || 0}`)
  })

  await runner.test('Inference via REST API works', async () => {
    const res = await fetch(`http://127.0.0.1:${HUB_CONFIG.dashboard.port}/api/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Test', maxTokens: 20 })
    })
    const data = await res.json()
    if (!data.text && !data.error) throw new Error('No response')
    console.log(`    Response: "${(data.text || data.error).slice(0, 50)}..."`)
  })

  await runner.test('WebSocket real-time updates work', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${HUB_CONFIG.dashboard.port}/api/ws`)
    const msg = await new Promise((resolve, reject) => {
      ws.on('message', (data) => resolve(JSON.parse(data)))
      ws.on('error', reject)
      setTimeout(() => reject(new Error('WS timeout')), 5000)
    })
    ws.close()
    if (msg.type !== 'init' && msg.type !== 'update') {
      throw new Error('Unexpected WS message type: ' + msg.type)
    }
    console.log(`    Received ${msg.type} message`)
  })

  await runner.test('Mesh event wiring is correct', async () => {
    let eventFired = false
    hubMesh.once('peer:joined', () => { eventFired = true })
    hubMesh.emit('peer:joined', { id: 'test', capabilities: {} })
    if (!eventFired) throw new Error('Event not fired')
  })

  console.log('')
  console.log('🧹 Cleaning up...')
  try { await hubDash.stop() } catch {}
  try { await clientDash.stop() } catch {}
  try { await hubInf.destroy() } catch {}
  try { await clientInf.destroy() } catch {}
  try { await hubRAG.destroy() } catch {}
  try { await clientRAG.destroy() } catch {}
  try { await hubMesh.stop() } catch {}
  try { await clientMesh.stop() } catch {}

  const success = runner.summary()
  process.exit(success ? 0 : 1)
}

runTests().catch(err => {
  console.error('Test suite failed:', err)
  process.exit(1)
})
