# Using Ollama with Roopik Evals

## Quick Start

### 1. Install Ollama

```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows
# Download from https://ollama.ai/download
```

### 2. Pull a Model

```bash
# Recommended models for coding
ollama pull llama3.2          # Fast, good for evals
ollama pull codellama         # Optimized for code
ollama pull deepseek-coder    # Excellent for coding tasks
ollama pull qwen2.5-coder     # Great code understanding
```

### 3. Verify Ollama is Running

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# You should see a list of your models
```

### 4. Configure Roopik Evals

Edit `.env`:

```bash
# Ollama configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL_ID=llama3.2

# Optional: Force Ollama as provider
EVAL_PROVIDER=ollama
```

### 5. Run Evals

```bash
pnpm test:ipc --provider=ollama
```

## Using LM Studio

### 1. Download LM Studio

Download from: https://lmstudio.ai

### 2. Load a Model

- Open LM Studio
- Search for models (e.g., "llama-3.2", "codellama")
- Download and load a model
- Start the local server (usually on port 1234)

### 3. Configure Roopik Evals

Edit `.env`:

```bash
# LM Studio configuration
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_MODEL_ID=your-model-name

# Optional: Force LM Studio as provider
EVAL_PROVIDER=lmstudio
```

### 4. Run Evals

```bash
pnpm test:ipc --provider=lmstudio
```

## Benefits of Local Providers

✅ **Privacy**: All data stays on your machine
✅ **Cost**: No API costs
✅ **Speed**: No network latency
✅ **Offline**: Works without internet
✅ **Control**: Full control over model and parameters

## Recommended Models for Evals

| Model | Size | Speed | Quality | Use Case |
|-------|------|-------|---------|----------|
| llama3.2 | 3B | ⚡⚡⚡ | ⭐⭐⭐ | Fast evals, testing |
| codellama | 7B | ⚡⚡ | ⭐⭐⭐⭐ | Code generation |
| deepseek-coder | 6.7B | ⚡⚡ | ⭐⭐⭐⭐⭐ | Best for coding |
| qwen2.5-coder | 7B | ⚡⚡ | ⭐⭐⭐⭐⭐ | Code understanding |

## Troubleshooting

**"Failed to connect to IPC socket"**
- Make sure Ollama/LM Studio is running
- Check the base URL is correct
- Verify the model is loaded

**"Model not found"**
- Check `ollama list` to see available models
- Make sure `OLLAMA_MODEL_ID` matches exactly

**Slow performance**
- Use smaller models (3B-7B)
- Increase `ollamaNumCtx` for longer context
- Consider using GPU acceleration

## Example .env for Ollama

```bash
# Ollama (Local)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL_ID=llama3.2

# Force Ollama
EVAL_PROVIDER=ollama

# Eval settings
EVAL_TIMEOUT=10  # Local models might need more time
```
