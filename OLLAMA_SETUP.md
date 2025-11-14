# Ollama Setup Guide for Roofing CRM

## What is Ollama?

Ollama is a local LLM (Large Language Model) runtime that lets you run powerful AI models on your own hardware - completely free and private. No API costs, no data leaving your servers.

## Installation

### macOS
```bash
brew install ollama
```

Or download from: https://ollama.com/download/mac

### Linux
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Windows
Download installer from: https://ollama.com/download/windows

## Download Models

After installing Ollama, pull the recommended models:

```bash
# Best quality (27B parameters, requires 32GB+ RAM or GPU)
ollama pull gemma2:27b

# Fast and accurate (7B parameters, works on 16GB RAM)
ollama pull llama3.2:latest

# Very fast responses (7B parameters)
ollama pull mixtral:latest

# For code/technical tasks
ollama pull codellama:latest

# Smaller models for lower-end hardware
ollama pull gemma2:9b    # 9B - Good balance
ollama pull llama3.2:3b  # 3B - Very fast, basic tasks
```

## Start Ollama

### As a Service (Recommended)
Ollama usually starts automatically after installation.

Check if running:
```bash
ollama list
```

### Manual Start
```bash
ollama serve
```

Keep this terminal open or run as a background service.

## Configure CRM

Add to `apps/api/.env`:
```bash
# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=gemma2:27b

# Optional: Fallback to cloud providers
OPENAI_API_KEY=sk-...  # Optional
ANTHROPIC_API_KEY=sk-... # Optional
```

## Test Installation

### 1. Test Ollama Directly
```bash
ollama run gemma2:27b "Hello, how are you?"
```

### 2. Test from CRM API
```bash
# Start your API server
cd apps/api
pnpm dev

# In another terminal
curl http://localhost:4000/api/ai/health
```

Expected response:
```json
{
  "ollama": {
    "available": true,
    "models": ["gemma2:27b", "llama3.2:latest", ...]
  },
  "status": "healthy",
  "message": "AI services operational"
}
```

### 3. Test AI Chat
```bash
# Get auth token first (login)
TOKEN="your-jwt-token"

# Chat with AI
curl -X POST http://localhost:4000/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Create a lead for John Smith, phone 555-1234, interested in roof repair"
      }
    ]
  }'
```

## Model Comparison

| Model | Size | RAM Needed | Speed | Quality | Best For |
|-------|------|------------|-------|---------|----------|
| gemma2:27b | 27B | 32GB+ | Slow | Excellent | Complex reasoning, analysis |
| gemma2:9b | 9B | 16GB | Medium | Very Good | General use, balanced |
| llama3.2:latest | 7B | 8GB | Fast | Very Good | Quick responses, chat |
| llama3.2:3b | 3B | 4GB | Very Fast | Good | Simple tasks, mobile |
| mixtral:latest | 7B | 8GB | Very Fast | Good | Real-time chat |
| codellama:latest | 7B | 8GB | Medium | Good | Code, technical |

## Hardware Requirements

### Minimum (3B-7B models)
- **RAM**: 8GB
- **CPU**: Modern quad-core (Intel i5/AMD Ryzen 5+)
- **Disk**: 10GB free space
- **Speed**: 1-3 seconds per response

### Recommended (9B-27B models)
- **RAM**: 32GB+
- **CPU**: 8+ cores (Intel i7/AMD Ryzen 7+)
- **Disk**: 50GB SSD
- **Speed**: 2-5 seconds per response

### With GPU (10x faster!)
- **GPU**: NVIDIA with 12GB+ VRAM
  - RTX 3060 (12GB) - good for 7B-13B models
  - RTX 4090 (24GB) - excellent for up to 70B models
  - A100 (40GB/80GB) - production ready
- **Speed**: 0.1-0.5 seconds per response

## GPU Acceleration (Optional but Recommended)

### Check if GPU is detected:
```bash
ollama ps
```

Should show: `GPU: NVIDIA ...`

### Enable GPU in CRM:
GPU acceleration is automatic if detected by Ollama!

## Performance Tuning

### For Low-End Hardware
Use smaller, faster models:
```bash
# In apps/api/.env
OLLAMA_DEFAULT_MODEL=llama3.2:3b
```

### For High-End Hardware
Use larger, more capable models:
```bash
# In apps/api/.env
OLLAMA_DEFAULT_MODEL=gemma2:27b
```

### Adjust Temperature
Lower = more predictable, Higher = more creative

```typescript
// In API requests
{
  "messages": [...],
  "temperature": 0.7  // 0.1-1.0, default 0.7
}
```

## Common Issues

### "Connection refused"
Ollama is not running.
```bash
ollama serve
```

### "Model not found"
Pull the model first:
```bash
ollama pull gemma2:27b
```

### Slow responses
- Use smaller model (llama3.2:3b)
- Close other applications
- Consider GPU acceleration

### Out of memory
- Use smaller model
- Close other applications
- Increase system swap space

## Production Deployment

### Docker
```dockerfile
FROM ollama/ollama:latest

# Pull models during build
RUN ollama pull gemma2:27b
RUN ollama pull llama3.2:latest

EXPOSE 11434
CMD ["ollama", "serve"]
```

### Kubernetes
Use the official Ollama Helm chart:
```bash
helm repo add ollama https://ollama.github.io/ollama-helm
helm install ollama ollama/ollama
```

### Load Balancing
For high traffic, run multiple Ollama instances:
```bash
# Instance 1
OLLAMA_HOST=0.0.0.0:11434 ollama serve

# Instance 2
OLLAMA_HOST=0.0.0.0:11435 ollama serve

# Configure nginx/HAProxy for load balancing
```

## Monitoring

### Check Ollama Status
```bash
curl http://localhost:11434/api/tags
```

### Monitor Resource Usage
```bash
# CPU & RAM
htop

# GPU (if using NVIDIA)
nvidia-smi
```

### CRM Health Check
```bash
curl http://localhost:4000/api/ai/health
```

## Cost Savings

Running Ollama locally vs cloud providers:

**OpenAI GPT-4:**
- $0.03 per 1K tokens (input)
- $0.06 per 1K tokens (output)
- ~1000 conversations/month = $50-100/month

**Ollama (Local):**
- One-time hardware cost
- $0/month ongoing
- Unlimited usage
- **Savings: $600-1200/year**

## Privacy Benefits

✅ All data stays on your servers
✅ No external API calls for AI features
✅ HIPAA/GDPR compliant (your data, your control)
✅ No rate limits
✅ Offline capable

## Support & Resources

- **Ollama Documentation**: https://ollama.com/docs
- **Model Library**: https://ollama.com/library
- **Discord Community**: https://discord.gg/ollama
- **GitHub**: https://github.com/ollama/ollama

## FAQ

**Q: Can I use both Ollama and OpenAI?**
A: Yes! The CRM automatically falls back to OpenAI if Ollama is unavailable.

**Q: Which model should I use?**
A: Start with `llama3.2:latest` for speed, upgrade to `gemma2:27b` if you have RAM.

**Q: Does it work on Mac M1/M2/M3?**
A: Yes! Apple Silicon has excellent performance for LLMs.

**Q: Can I run this on a VPS?**
A: Yes, but you'll need adequate RAM. Recommend 16GB+ VPS for production.

**Q: Is it truly free?**
A: Yes! Ollama and all models are completely free and open-source.

---

**Ready to start?** Run `ollama pull gemma2:27b` and enjoy AI-powered CRM features!
