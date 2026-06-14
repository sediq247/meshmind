import WebSocket from 'ws'

/**
 * Simple API test script for MeshMind
 * Tests REST and WebSocket endpoints
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const WS_URL = BASE_URL.replace('http', 'ws')

async function testREST() {
  console.log('[Test] Testing REST endpoints...')

  const endpoints = ['/api/status', '/api/peers', '/api/models', '/api/rag/stats']

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${BASE_URL}${endpoint}`)
      const data = await res.json()
      console.log(`  âœ… ${endpoint}:`, JSON.stringify(data).slice(0, 100))
    } catch (err) {
      console.log(`  âŒ ${endpoint}:`, err.message)
    }
  }
}

async function testInference() {
  console.log('[Test] Testing inference endpoint...')

  try {
    const res = await fetch(`${BASE_URL}/api/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'What is edge AI?',
        maxTokens: 128
      })
    })
    const data = await res.json()
    console.log('  âœ… Inference response:', data.text?.slice(0, 100) || data.error)
  } catch (err) {
    console.log('  âŒ Inference failed:', err.message)
  }
}

async function testWebSocket() {
  console.log('[Test] Testing WebSocket...')

  return new Promise((resolve) => {
    const ws = new WebSocket(`${WS_URL}/api/ws`)

    ws.on('open', () => {
      console.log('  âœ… WebSocket connected')
    })

    ws.on('message', (data) => {
      const msg = JSON.parse(data)
      if (msg.type === 'init') {
        console.log('  âœ… Initial state received:', msg.data.nodeId)
        ws.close()
        resolve()
      }
    })

    ws.on('error', (err) => {
      console.log('  âŒ WebSocket error:', err.message)
      resolve()
    })

    setTimeout(() => {
      console.log('  âš ï¸ WebSocket timeout')
      ws.close()
      resolve()
    }, 5000)
  })
}

async function main() {
  console.log('ðŸ§  MeshMind API Test Suite')
  console.log('===========================')
  console.log(`Target: ${BASE_URL}`)
  console.log('')

  await testREST()
  console.log('')
  await testInference()
  console.log('')
  await testWebSocket()

  console.log('')
  console.log('âœ… Test complete')
}

main().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})
