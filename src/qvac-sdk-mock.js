/**
* QVAC SDK Mock / Fallback
*
* This module provides a compatible API surface for @qvac/sdk.
* When the real SDK is installed, it re-exports from the real package.
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

// ─── Real SDK exports (if available) ──────────────────────────
if (sdk) {
  export const loadModel = sdk.loadModel
  export const unloadModel = sdk.unloadModel
  export const completion = sdk.completion
  export const ragSaveEmbeddings = sdk.ragSaveEmbeddings
  export const ragSearch = sdk.ragSearch
  export const voiceAssistant = sdk.voiceAssistant
  export const isMock = false
} else {
  // ─── Mock implementations ──────────────────────────────────
 
  let mockModelCounter = 0
  const mockModels = new Map()
 
  export async function loadModel({ modelSrc, modelType, onProgress }) {
    mockModelCounter++
    const modelId = `mock-model-${modelType}-${mockModelCounter}`
    mockModels.set(modelId, { modelSrc, modelType, loadedAt: Date.now() })
    if (onProgress) onProgress({ percent: 100, loaded: 1, total: 1 })
    console.log(`[QVAC Mock] loadModel: ${modelSrc} -> ${modelId}`)
    return modelId
  }
 
  export async function unloadModel({ modelId }) {
    mockModels.delete(modelId)
    console.log(`[QVAC Mock] unloadModel: ${modelId}`)
  }
 
  export function completion({ modelId, history, stream, maxTokens, temperature, kvCache }) {
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
 
  export async function ragSaveEmbeddings({ modelId, documents, chunk }) {
    return documents.map((d, i) => ({
      id: `emb-${i}`,
      content: d,
      embedding: Array(384).fill(0).map(() => Math.random() * 2 - 1)
    }))
  }
 
  export async function ragSearch({ modelId, query, topK }) {
    return [
      { content: `Result for "${query}": Edge AI runs on local devices.`, score: 0.95, docId: 'doc-1' },
      { content: `Result for "${query}": Local inference provides privacy.`, score: 0.87, docId: 'doc-2' },
      { content: `Result for "${query}": Mesh networks are resilient.`, score: 0.82, docId: 'doc-3' }
    ].slice(0, topK || 5)
  }
 
  export async function voiceAssistant({ modelId, audioInput, onToken }) {
    const tokens = ['Hello', ', ', 'I', ' heard', ' you', ' say', ' something', '.']
    if (onToken) {
      for (const t of tokens) {
        await new Promise(r => setTimeout(r, 50))
        onToken(t)
      }
    }
    return { text: tokens.join(''), tokensGenerated: tokens.length }
  }
 
  export const isMock = true
}

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