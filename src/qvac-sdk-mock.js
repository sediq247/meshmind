/**
* QVAC SDK Mock / Fallback
*
* This module provides a compatible API surface for @qvac/sdk.
* When the real SDK is installed, it re-exports from the real package.
* When the real SDK is NOT installed (e.g., on Render/DoraHacks), it provides
* functional mocks that let MeshMind start, serve the dashboard, and run tests.
*
* To use the real SDK locally:
*   npm install @qvac/sdk
*   or link from local build: npm link /path/to/qvac/sdk
*/

let sdk = null
try {
  sdk = await import('@qvac/sdk')
  console.log('[QVAC] Using real @qvac/sdk')
} catch (err) {
  console.log('[QVAC] @qvac/sdk not found — using mock fallback (demo mode)')
}

// ─── Conditional implementations ──────────────────────────────

let _loadModel, _unloadModel, _completion, _ragSaveEmbeddings, _ragSearch, _voiceAssistant, _isMock

if (sdk) {
  _loadModel = sdk.loadModel
  _unloadModel = sdk.unloadModel
  _completion = sdk.completion
  _ragSaveEmbeddings = sdk.ragSaveEmbeddings
  _ragSearch = sdk.ragSearch
  _voiceAssistant = sdk.voiceAssistant
  _isMock = false
} else {
  // ─── Mock implementations ──────────────────────────────────

  let mockModelCounter = 0
  const mockModels = new Map()

  _loadModel = async function loadModel({ modelSrc, modelType, onProgress }) {
    mockModelCounter++
    const modelId = `mock-model-${modelType}-${mockModelCounter}`
    mockModels.set(modelId, { modelSrc, modelType, loadedAt: Date.now() })
    if (onProgress) onProgress({ percent: 100, loaded: 1, total: 1 })
    console.log(`[QVAC Mock] loadModel: ${modelSrc} -> ${modelId}`)
    return modelId
  }

  _unloadModel = async function unloadModel({ modelId }) {
    mockModels.delete(modelId)
    console.log(`[QVAC Mock] unloadModel: ${modelId}`)
  }

  _completion = function completion({ modelId, history, stream, maxTokens, temperature, kvCache }) {
    const prompt = history?.[0]?.content || 'Hello'
    const tokens = generateMockTokens(prompt, maxTokens || 512)

    if (stream) {
      return {
        tokenStream: (async function* () {
          for (const t of tokens) {
            await new Promise(r => setTimeout(r, 30))
            yield t
          }
        })(),
        tokensGenerated: tokens.length
      }
    }

    return {
      text: Promise.resolve(tokens.join('')),
      tokensGenerated: tokens.length
    }
  }

  _ragSaveEmbeddings = async function ragSaveEmbeddings({ modelId, documents, chunk }) {
    return documents.map((d, i) => ({
      id: `emb-${i}`,
      content: d,
      embedding: Array(384).fill(0).map(() => Math.random() * 2 - 1)
    }))
  }

  _ragSearch = async function ragSearch({ modelId, query, topK }) {
    return [
      { content: `Result for "${query}": Edge AI runs on local devices.`, score: 0.95, docId: 'doc-1' },
      { content: `Result for "${query}": Local inference provides privacy.`, score: 0.87, docId: 'doc-2' },
      { content: `Result for "${query}": Mesh networks are resilient.`, score: 0.82, docId: 'doc-3' }
    ].slice(0, topK || 5)
  }

  _voiceAssistant = async function voiceAssistant({ modelId, audioInput, onToken }) {
    const tokens = ['Hello', ', ', 'I', ' heard', ' you', ' say', ' something', '.']
    if (onToken) {
      for (const t of tokens) {
        await new Promise(r => setTimeout(r, 50))
        onToken(t)
      }
    }
    return { text: tokens.join(''), tokensGenerated: tokens.length }
  }

  _isMock = true
}

// ─── Top-level exports (valid ESM) ───────────────────────────
export const loadModel = _loadModel
export const unloadModel = _unloadModel
export const completion = _completion
export const ragSaveEmbeddings = _ragSaveEmbeddings
export const ragSearch = _ragSearch
export const voiceAssistant = _voiceAssistant
export const isMock = _isMock

// ─── Helper ──────────────────────────────────────────────────
function generateMockTokens(prompt, maxTokens) {
  const responses = [
    'MeshMind is a P2P distributed AI mesh that runs entirely on local devices.',
    'Edge AI provides privacy, low latency, and offline capability.',
    'The mesh automatically routes inference to the most capable peer.',
    'Distributed RAG allows semantic search across community knowledge bases.',
    'When the internet goes down, MeshMind keeps running.',
    'Consumer devices can form a self-organizing intelligence network.',
    'No cloud. No API bills. No vendor lock-in. Just pure local AI.',
    'Hyperswarm P2P networking enables NAT traversal without configuration.',
    'BitNet quantization allows billion-parameter models on smartphones.',
    'The future of AI is local, private, and owned by you.'
  ]

  const base = responses[Math.floor(Math.random() * responses.length)]
  const words = base.split(' ')
  const limited = words.slice(0, Math.min(words.length, Math.floor(maxTokens / 2)))
  return limited.map(w => w + ' ')
}