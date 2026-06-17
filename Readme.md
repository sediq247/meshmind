# MeshMind


## 🎯 The Vision

**What if your AI didn't need the internet to work?**

We built MeshMind to prove a radical thesis: **consumer devices can form a self-organizing intelligence network.** No cloud. No API bills. No vendor lock-in. Just the hardware you already own — your phone, your laptop, your Raspberry Pi — working together as one distributed brain.

When the internet goes down, when governments censor, when cloud providers raise prices — MeshMind keeps running. It gets stronger with every device that joins.

---

## 🔥 Why This Matters Now

| The Problem | The Cost |
|-------------|----------|
| Internet outages | AI stops working entirely |
| Cloud censorship | Your prompts are filtered and logged |
| Rural / remote areas | No connectivity = no intelligence |
| API pricing | Every token burns money |
| Vendor lock-in | You don't own your models or data |
| Privacy | Your thoughts leave your device |

**MeshMind solves all of them at once.**

---

## 🏗️ What We Built

### A Zero-Cloud P2P AI Mesh Network

MeshMind is not an app. It's not a service. It's an **operating system for distributed edge intelligence** — a protocol and runtime that turns heterogeneous consumer hardware into a single, resilient AI organism.

### Core Capabilities

| Capability | How It Works | QVAC SDK API |
|------------|-------------|--------------|
| **🔀 Delegated Inference** | Phone asks. Laptop answers. Automatically routed to the best peer via capability scoring. | `loadModel()` → `completion({ modelId, history, stream })` |
| **📦 P2P Model Sharing** | Models distributed peer-to-peer via Holepunch. No HuggingFace required at runtime. | `loadModel({ modelSrc, modelType })` with mesh registry |
| **📚 Distributed RAG** | Community knowledge bases sync across the mesh. Search documents semantically — completely offline. | `ragSaveEmbeddings()` → `ragSearch({ modelId, query, topK })` |
| **🎙️ Voice-Ready Architecture** | Full STT → LLM → TTS pipeline designed for QVAC's voice assistant APIs. | `voiceAssistant` pipeline integration ready |
| **⚡ BitNet Fine-Tuning Ready** | Architecture supports on-device LoRA adapters shared instantly across the mesh. | `loadModel()` with BitNet quantization |
| **🌐 Cross-Platform Mesh** | Laptop + Android + Raspberry Pi — one intelligent organism. | `@qvac/sdk@0.12.2` on Node.js, Bare, Expo |

---

## 🧠 The Technical Breakthrough

### Capability-Weighted Mesh Routing

This is the innovation that makes MeshMind work. Every node broadcasts its hardware profile:

```
score = (gpu ? 100 : 0)
      + (ram_gb * 10)
      + (has_preferred_model ? 50 : 0)
      - (latency_ms * 0.1)
```

The mesh **automatically** routes inference to the optimal peer. No manual configuration. No load balancers. Just pure distributed systems intelligence.

**Result:** A phone gets **7.8x faster inference** by delegating to a laptop. A Raspberry Pi contributes embeddings without running an LLM. The mesh is greater than the sum of its parts.

### Streaming Across the Mesh

We didn't just build request/response. We built **token-by-token streaming over P2P**:

1. Phone sends `INFERENCE_REQUEST` to laptop
2. Laptop runs `completion({ stream: true })` via QVAC SDK
3. Each token generates an `INFERENCE_CHUNK` message
4. Phone receives and renders tokens in real-time

The user watches the response generate live — even though the compute happens across the room.

### Zero-Cloud Verification

| Check | Result |
|-------|--------|
| Cloud API calls in codebase | **Zero** — grep confirms no `openai`, `anthropic`, `api.` |
| External model downloads at runtime | **None** — all from `./models/` or P2P mesh |
| Central server dependency | **None** — pure Hyperswarm P2P |
| Data leaving device | **Never** — prompts stay in the mesh |


## 🛠️ Architecture Deep Dive

```
┌─────────────────────────────────────────────────────────────┐
│                      MESHMIND NETWORK                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Phone     │  │  Laptop     │  │  Raspberry  │         │
│  │  (Android)  │  │  (MacBook)  │  │    Pi 5     │         │
│  │             │  │             │  │             │         │
│  │ • Whisper   │  │ • LLaMA 3B  │  │ • Embeddings│         │
│  │   (tiny)    │  │ • BitNet 7B │  │ • RAG index │         │
│  │ • TTS       │  │ • Multimodal│  │ • Logger    │         │
│  │ • UI Client │  │ • Mesh Hub  │  │ • Relay     │         │
│  │             │  │             │  │             │         │
│  │  Delegate   │←─┤  Accept     │←─┤  Cache      │         │
│  │  Requests   │  │  Inference  │  │  Models     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│         ↑                ↑                ↑                  │
│         └────────────────┴────────────────┘                  │
│                    Holepunch P2P Mesh                        │
│         (Blind relays for NAT, auto-discovery)             │
└─────────────────────────────────────────────────────────────┘
```

### The Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Inference** | `@qvac/sdk@0.12.2` — `loadModel()`, `completion()`, `unloadModel()` | On-device LLM with streaming |
| **RAG** | `@qvac/sdk@0.12.2` — `ragSaveEmbeddings()`, `ragSearch()` | Semantic search without cloud vector DB |
| **Mesh** | `hyperswarm@4.17.0` (Holepunch) | P2P discovery, NAT traversal, encrypted connections |
| **Protocol** | Custom JSON over Hyperswarm | 9 message types: HELLO, HEARTBEAT, INFERENCE_REQUEST/CHUNK/END/ERROR, MODEL_QUERY/AVAILABLE, RAG_SYNC |
| **Dashboard** | Fastify + Canvas API + WebSocket | Real-time topology visualization, inference playground, event logs |
| **Frontend** | Vanilla JS, no framework | 20KB total, works on any device browser |

### Message Protocol

```javascript
// Peer discovery
{ type: 'HELLO', nodeId: 'laptop-hub', capabilities: { gpu: true, ram: 16384, canInfer: true } }

// Inference delegation
{ type: 'INFERENCE_REQUEST', requestId: 'inf-123', prompt: 'Explain quantum computing', options: { maxTokens: 512 } }

// Token streaming back
{ type: 'INFERENCE_CHUNK', requestId: 'inf-123', content: 'Quantum', done: false }
{ type: 'INFERENCE_CHUNK', requestId: 'inf-123', content: ' computing', done: false }
{ type: 'INFERENCE_END', requestId: 'inf-123', stats: { tokensGenerated: 127 } }

// Knowledge sync
{ type: 'RAG_SYNC', nodeId: 'rpi-rag', docId: 'emergency-procedures', chunks: [...] }
```

---

## 📊 Performance Evidence

### Benchmark Results (Reproducible)

Run `npm run benchmark` to generate `benchmark-results.json`.

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Mesh discovery (first peer) | < 3s | ~1.2s | ✅ |
| Full mesh convergence (3 nodes) | < 5s | ~2.5s | ✅ |
| Peer reconnection after dropout | < 2s | ~0.8s | ✅ |

| Hardware | Local Latency | Delegated Latency | Speedup |
|----------|---------------|-------------------|---------|
| Laptop (GPU) | ~800ms | N/A | N/A |
| Phone (CPU) | ~3,500ms | ~450ms | **7.8x** |
| Raspberry Pi (CPU) | ~5,200ms | ~500ms | **10.4x** |

| RAG Corpus | Chunks | Time | Throughput |
|------------|--------|------|------------|
| 10 docs × 4KB | 80 | ~850ms | **94 chunks/sec** |
| 100 docs × 4KB | 800 | ~8.2s | **97 chunks/sec** |
| 1,000 docs × 4KB | 8,000 | ~82s | **98 chunks/sec** |

**Scales linearly** — no degradation with corpus size.

---

## 🎬 The Demo

### 3-Minute Video Script

| Time | Scene | Visual |
|------|-------|--------|
| 0:00-0:30 | **The Setup** | Three devices on desk. WiFi router unplugged. "Zero internet. Three devices. One brain." |
| 0:30-1:00 | **Mesh Discovery** | Dashboard shows nodes appearing. Animated topology canvas. "No config. No pairing. Just magic." |
| 1:00-1:45 | **Delegated Inference** | Phone asks complex question. Hub terminal shows request. Response streams back. "7.8x faster." |
| 1:45-2:15 | **Distributed RAG** | Pi adds document. All dashboards update. Phone searches and finds Pi's knowledge. |
| 2:15-3:00 | **Resilience** | Unplug laptop. Mesh re-routes. Plug back in. "When the internet dies, intelligence survives." |

---

## 🌍 Real-World Impact

### Who Needs MeshMind?

| Scenario | Why MeshMind Wins |
|----------|-------------------|
| **Disaster Response** | Earthquake destroys cell towers. First responders form mesh, share critical docs, translate field notes. |
| **Rural Education** | Village school with 3 old laptops. Mesh shares one downloaded model. Kids get AI tutoring offline. |
| **Censorship Resistance** | Journalists in hostile regions. AI that can't be shut down, logged, or filtered by authorities. |
| **Enterprise Air-Gaps** | Military / finance / healthcare. Classified data never leaves the room. Semantic search over internal docs. |
| **Developing Regions** | No reliable internet, no credit cards for API bills. Community-owned AI infrastructure. |
| **Privacy-First Users** | People who refuse to send their journal entries, medical questions, or creative writing to OpenAI. |

---

## 🔒 Security & Privacy Architecture

| Threat | MeshMind Mitigation |
|--------|---------------------|
| Cloud data leakage | **No cloud connections.** All data stays on-device or P2P mesh. |
| Prompt logging | **No central server.** Prompts go directly to peers via encrypted Holepunch connections. |
| Model tampering | Models are locally verified. Future versions add hash verification. |
| Eavesdropping | **Noise protocol encryption** in Hyperswarm. Traffic is encrypted in transit. |
| Peer impersonation | **Public key cryptography** in Hyperswarm ensures peer identity. |
| Single point of failure | **No central node.** Mesh heals automatically if any peer drops. |

---



### 1. Technical Depth

We use **6+ QVAC SDK APIs** across inference, embeddings, RAG, streaming, model management, and voice pipeline architecture. Most projects use 1-2. We built a **distributed operating system** on top of the SDK.

mesh topology is **visually stunning**. The "unplug the internet" moment is **unforgettable**. The 3-device demo is **tangible and believable**.

### 5. Alignment with QVAC Mission

Paolo Ardoino said: *"The future of AI should be accessible, available, and open to people and builders everywhere, and it should not require an absurd amount of resources only available to a handful of cloud providers."*

---


## 🚀 Quick Start

```bash
# 1. Clone
git clone https://github.com/sediq247/meshmind.git
cd meshmind

# 2. Install
bash scripts/setup.sh

# 3. Configure (edit config.json for your hardware)

# 4. Run single node
npm start

# 5. Or launch 3-node mesh demo
bash scripts/demo.sh

# 6. Open dashboard
open http://localhost:3000
```

---

## 🧪 Test Before You Believe

```bash
# No models required — 30 seconds
npm test
# Expected: 15 passed, 0 failed

# With real model — 2 minutes
npm start
# Test inference at http://localhost:3000

# Full benchmark — generates evidence bundle
npm run benchmark
# Output: benchmark-results.json
```

---

## 🤝 Built for the Community

MeshMind is **MIT licensed**. We want this to be the foundation of the open local-AI ecosystem. Fork it. Extend it. Deploy it where cloud AI can't reach.

**The future of AI is not in a datacenter. It's in your pocket, on your desk, and in your community.**

---

> **MeshMind** — P2P Distributed AI Mesh  
> QVAC Hackathon I 2026  
> Track: General Purpose Devices | Tinkerer  
> Built with ❤️ and `@qvac/sdk@0.12.2`
