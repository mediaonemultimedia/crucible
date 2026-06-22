# AI Node Studio

Node-based AI video and image pipeline. Uses Claude for prompt enhancement and subject detection, Higgsfield for generation.

## Setup

### 1. Clone the repo
```bash
git clone <your-repo-url>
cd ai-node-studio
```

### 2. Add API keys
```bash
cp backend/.env.example backend/.env
# Edit backend/.env and add:
# ANTHROPIC_API_KEY=sk-ant-...
# HIGGSFIELD_API_KEY=...
```

### 3. Run
```bash
./start.sh
```

Then open http://localhost:5173

## Requirements
- Python 3.10+
- Node.js 18+
- ffmpeg (`brew install ffmpeg`) — needed for Frame Painter frame extraction
