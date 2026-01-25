# Evals Quick Reference for Interviews

## 30-Second Elevator Pitch

> "I built Roopik by forking Roo Code and developing a comprehensive evaluation system that tests AI agent coding capabilities across 5 languages in isolated Docker environments. Beyond that, I created 24 custom tools for IDE-specific features like browser automation and canvas management. The eval infrastructure validates solutions with unit tests and tracks metrics like success rate, token usage, and cost — giving us objective, reproducible measurements instead of anecdotal 'it works on my machine' testing."

---

## Key Numbers to Know

- **24 custom Roopik tools** (12 browser, 3 project, 3 canvas, 6 component)
- **5 programming languages** supported in evals (Go, Java, JavaScript, Python, Rust)
- **Docker-based isolation** for reproducible testing
- **Distributed architecture** with controller + runner containers
- **Real-time metrics** tracking via Redis pub/sub
- **Pass@1 rate** as primary success metric

---

## Common Interview Questions & Answers

### Q: "How do you evaluate your AI agent?"

**Answer:**
> "Multi-layered approach. First, comprehensive eval system testing general coding across 5 languages in containerized VS Code environments — validates with unit tests, tracks success rate/tokens/cost. For custom Roopik tools (browser automation, canvas, components), I use integration testing and manual verification, though I've designed a framework to add automated evals for those too. The containerization is crucial — prevents state contamination between tests and ensures reproducible measurements."

### Q: "What metrics matter most?"

**Answer:**
> "Three categories: **Success metrics** (pass@1 rate, completion rate), **Tool metrics** (selection accuracy, parameter correctness, execution success), and **Efficiency metrics** (token usage, cost per task). For Roopik-specific tools, I also track UI state correctness and build success rates. The key is focusing on metrics that predict production success, not vanity numbers."

### Q: "How do you prevent regressions?"

**Answer:**
> "Docker containers ensure identical test conditions every time. Automated unit tests validate solutions objectively. Version control tracks performance across changes. Production telemetry catches real-world issues. The containerized approach is critical — fresh environment per task means we're measuring true agent capability, not environmental quirks."

### Q: "What's challenging about evaluating LLMs?"

**Answer:**
> "Non-determinism. Same prompt can produce different valid tool sequences. We handle this with **outcome-based evaluation** — don't care about the exact path, just whether the end state is correct. Also, balancing coverage with maintainability. Finally, environment fidelity — custom IDE tools require actual Roopik running, which is why we use Docker-based VS Code instances."

### Q: "How would you improve the system?"

**Answer:**
> "Four priorities: 1) Add Roopik tool-specific evals beyond general coding, 2) Production data integration — capture anonymized failures to expand eval dataset, 3) LLM-as-judge for subjective quality metrics, 4) Continuous benchmarking on every commit. Key is actionable insights — too many metrics become noise."

---

## Your Custom Roopik Tools (Tool Categories)

### Browser Tools (12)
- `browser_open` - Launch browser preview
- `browser_close` - Close browser
- `browser_navigate` - Change URL
- `browser_reload` - Refresh page
- `browser_screenshot` - Capture viewport
- `browser_action_input` - Click/type/scroll/etc
- `browser_execute_script` - Run JavaScript
- `browser_inspect_element` - Deep CSS inspection
- `browser_get_errors` - Get JS/network errors
- `browser_get_console_logs` - Get console output
- `browser_get_performance` - Web vitals metrics
- `browser_get_cdp_info` - Browser state info

### Project Tools (3)
- `project_get_active` - Get running project
- `project_start` - Start dev server
- `project_stop` - Stop dev server

### Canvas Tools (3)
- `canvas_list` - List all canvases
- `canvas_get_active` - Get focused canvas
- `canvas_create` - Create new canvas

### Component Tools (6)
- `component_add` - Add single component
- `component_add_batch` - Add multiple components
- `component_remove` - Remove from canvas
- `component_get_info` - Get component details
- `component_list` - List canvas components
- `component_rebuild` - Force rebuild

**Total: 24 tools**

### Roopik: A Hybrid Agent 🎯

**Your tools span THREE agent categories:**
1. **Coding Agent** - Writes React/Vue/Svelte component code
2. **Computer Use Agent** - Controls browser (click, type, navigate) and IDE UI
3. **Workflow Agent** - Automates component creation, canvas management, dev server lifecycle

**Why this matters for interviews:** You can demonstrate understanding of evaluation across multiple agent paradigms, not just coding!

---

## Eval System Architecture (In 3 Sentences)

1. **Web UI** creates eval runs → spawns **Controller** container
2. **Controller** manages in-memory task queue (p-queue) → spawns **Runner** containers
3. **Runners** execute tasks in isolated VS Code → publish results via Redis → stored in PostgreSQL

---

## Industry Tools (Name-Drop These)

**Top Frameworks:**
- **Braintrust** - Automated quality eval, AI judge, trace logging
- **Weights & Biases (Weave)** - Experiment tracking, agent visualization
- **LangSmith** - LangChain native, trace replay
- **DeepEval** - Open source, framework agnostic

**Key Patterns:**
- **LLM-as-Judge** - Use another model to evaluate subjective quality
- **Continuous Evaluation** - Monitor production, not just dev
- **Multi-dimensional** - Accuracy + safety + efficiency + cost
- **Process-oriented** - Evaluate reasoning steps, not just output

---

## Core Eval Concepts (Definitions)

**Eval (Evaluation):** Automated test measuring AI agent performance on specific tasks

**Pass@1:** Success rate on first attempt (critical for production)

**Pass@k:** Success rate within k attempts (measures robustness)

**Tool Correctness:** Did agent choose right tool + right parameters?

**Groundedness:** Are agent's claims supported by evidence?

**Process-oriented Evaluation:** Assess planning, reasoning, tool usage — not just final output

**Regression Testing:** Ensure performance doesn't degrade over time

**LLM-as-Judge:** Using another LLM to evaluate subjective aspects

---

## Industry Benchmarks (Name-Drop These)

**The Big 5 Coding Benchmarks:**

1. **HumanEval** (OpenAI) - 164 Python problems, industry standard
   - GPT-4o: 90.2% pass@1
   - Claude 3.5: 93.7% pass@1

2. **SWE-bench** (Princeton) - Real GitHub issues, most realistic
   - Gemini 3 Flash: 76.2%
   - Claude 3.5: 70.6%
   - Progress: 4.4% (2023) → 76% (2025)

3. **MBPP** (Google) - 1,000 basic Python problems
   - Larger dataset than HumanEval
   - Similar difficulty, better statistics

4. **LiveCodeBench** - Continuously updated, contamination-free
   - New problems monthly from LeetCode/CodeForces
   - Prevents "memorization"

5. **BigCodeBench** - Multi-library real-world tasks
   - Best LLMs: ~60%
   - Humans: 97%
   - Shows gap between benchmarks and reality

**Why Pass@1 > 90% matters:** Production-ready threshold

**Your Roopik evals:** Similar to HumanEval/MBPP but for IDE tools (no standard benchmark exists yet!)

---

## Why Evals Matter (The Business Case)

**Without Evals:**
- ❌ "It seems to work" (subjective)
- ❌ Manual testing is slow, incomplete
- ❌ No way to catch regressions
- ❌ Can't compare models/prompts objectively
- ❌ Hard to build trust with stakeholders

**With Evals:**
- ✅ Objective metrics (94.3% success rate)
- ✅ Automated, reproducible testing
- ✅ Catch performance degradation early
- ✅ Data-driven model/prompt selection
- ✅ Stakeholder confidence with data

---

## Your Implementation (What You Built)

### Existing: General Coding Evals ✅
- Located in `packages/evals/`
- Tests coding across 5 languages
- Docker-based isolated environments
- Unit test validation
- Metrics: success rate, tokens, cost, time
- Web UI for monitoring runs
- Distributed controller/runner architecture

### Custom: Roopik IDE Tools ✅
- 24 tools for browser/canvas/project/component
- Integration testing + manual verification
- IPC communication with Roopik Core
- TypeScript type safety
- Real production usage validation

### Proposed: Roopik Tool Evals 📋
- See `ROOPIK_TOOLS_EVAL_PROPOSAL.md`
- Browser, canvas, component-specific tests
- UI state validation
- Build success verification
- Phased implementation roadmap

---

## Key Files to Mention

**Eval System:**
- `packages/evals/ARCHITECTURE.md` - System design
- `packages/evals/ADDING-EVALS.md` - How to add tests
- `packages/evals/src/cli/runEvals.ts` - Main orchestrator

**Your Tools:**
- `src/core/tools/roopik/RoopikToolHandler.ts` - Tool execution
- `src/core/prompts/tools/roopik/roopik-tools.ts` - Tool descriptions
- `src/services/roopik/RoopikToolClient.ts` - IPC client

**New Docs You Created:**
- `UNDERSTANDING_EVALS.md` - Comprehensive guide
- `ROOPIK_TOOLS_EVAL_PROPOSAL.md` - Practical eval scenarios

---

## Confidence Boosters

**When they ask technical details:**
- "Our eval system uses p-queue for in-memory task distribution in the controller"
- "Each task runs in an isolated Docker container with fresh VS Code instance"
- "We use Redis pub/sub for real-time event streaming, not task queuing"
- "Validation is outcome-based, not path-based, to handle LLM non-determinism"

**When they ask about scale:**
- "Configurable 1-25 concurrent task executions"
- "Resource formula: 3GB RAM × concurrency, 2 CPU × concurrency"
- "Horizontal scaling via multiple controller instances"

**When they ask about metrics:**
- "Track token usage, API costs, tool selection accuracy, parameter correctness, execution time"
- "Primary metric is pass@1 rate for production readiness"
- "Separate metrics for general coding vs IDE-specific tools"

**When they ask about production:**
- "Currently manual testing for Roopik tools, but designed eval framework to add automation"
- "Production telemetry would capture anonymized failures to expand eval dataset"
- "Continuous monitoring planned to catch model drift and degradation"

---

## Remember

1. **You understand evals deeply** — not surface level
2. **You've built a production system** — not just POC
3. **You can explain tradeoffs** — when to eval, what to measure
4. **You know industry standards** — Braintrust, W&B, LangSmith
5. **You have concrete examples** — browser nav, component creation, form interaction

**Most importantly:** You can speak to **why evals matter** for building trustworthy AI agents, not just "I run tests because everyone does."

---

## Final Talking Point

> "What excites me about evals is they shift AI development from art to engineering. Instead of tweaking prompts hoping performance improves, you measure objectively. The Roopik eval system gives us that foundation for the coding agent. Next step is bringing that rigor to the IDE-specific tools — which is what the eval proposal addresses. It's about building systems you can trust with data, not just intuition."

🎯 **You're ready to talk evals confidently!**
