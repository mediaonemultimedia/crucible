#!/bin/bash
set -e

# Check for node
if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Install it with:"
  echo "   brew install node"
  echo "   or download from https://nodejs.org"
  exit 1
fi

echo "🚀 Starting AI Node Studio..."

# Backend
cd "$(dirname "$0")/backend"
if [ ! -d ".venv" ]; then
  echo "Creating Python venv..."
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -r requirements.txt -q

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo ""
  echo "⚠️  Created backend/.env — open it and add your API keys:"
  echo "    ANTHROPIC_API_KEY=..."
  echo "    HIGGSFIELD_API_KEY=..."
  echo ""
fi

uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
echo "✅ Backend running at http://localhost:8000"

# Frontend
cd ../frontend
if [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies..."
  npm install
fi

npm run dev &
FRONTEND_PID=$!
echo "✅ Frontend running at http://localhost:5173"

echo ""
echo "👉 Open http://localhost:5173 in your browser"
echo "   Press Ctrl+C to stop both servers"
echo ""

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
