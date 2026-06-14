#!/bin/bash
set -e

echo "ðŸ§  MeshMind Setup"
echo "================="

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "âŒ Node.js not found. Install Node.js >= 18 first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "âŒ Node.js version must be >= 18. Found: $(node -v)"
    exit 1
fi

echo "âœ… Node.js $(node -v)"

# Install dependencies
echo "ðŸ“¦ Installing dependencies..."
npm install

# Create model directory
mkdir -p models

echo ""
echo "ðŸŽ‰ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Download QVAC-compatible models to ./models/"
echo "     - llama-3-8b-instruct-q4_k_m.gguf"
echo "     - all-minilm-l6-v2-q4_0.gguf"
echo "  2. Edit config.json for your hardware"
echo "  3. Run: npm start"
echo ""
echo "ðŸ“– See README.md for full instructions."
