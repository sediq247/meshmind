#!/bin/bash
set -e

echo "ðŸ§  MeshMind Multi-Node Demo"
echo "============================"

# Kill any existing demo nodes
pkill -f "node src/index.js --demo" 2>/dev/null || true
sleep 1

echo "ðŸš€ Starting 3-node mesh demo..."

# Node 1: Laptop (Hub â€” GPU enabled, strongest)
NODE_ID=laptop-hub GPU=true GPU_LAYERS=35 PORT=3001   node src/index.js --demo &
PID1=$!
echo "  [Hub]     Laptop node on port 3001 (PID: $PID1)"

sleep 2

# Node 2: Phone (Client â€” no GPU, delegates inference)
NODE_ID=phone-client GPU=false GPU_LAYERS=0 PORT=3002   node src/index.js --demo &
PID2=$!
echo "  [Client]  Phone node on port 3002 (PID: $PID2)"

sleep 2

# Node 3: Raspberry Pi (RAG node â€” handles embeddings)
NODE_ID=rpi-rag GPU=false GPU_LAYERS=0 PORT=3003   node src/index.js --demo &
PID3=$!
echo "  [RAG]     Pi node on port 3003 (PID: $PID3)"

echo ""
echo "âœ… All 3 nodes running!"
echo ""
echo "Dashboards:"
echo "  Hub:     http://localhost:3001"
echo "  Phone:   http://localhost:3002"
echo "  Pi:      http://localhost:3003"
echo ""
echo "Press Ctrl+C to stop all nodes"

# Wait for interrupt
trap "echo ''; echo 'ðŸ›‘ Stopping demo nodes...'; kill $PID1 $PID2 $PID3 2>/dev/null; exit 0" INT
wait
