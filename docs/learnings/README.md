# Development Learnings

Weekly learnings from building Roopik - organized by week.

## Index

- [Week 1](./week-01.md) - Extension Scaffold & Extension Types
  - Types of VS Code extensions (Declarative, Programmatic, Hybrid)
  - Extension architecture and entry points
  - TypeScript configuration chain
  - Build system integration
  - Code quality standards

- [Week 2](./week-02.md) - Webview + React Setup
  - Project structure (2 nested projects)
  - Extension backend vs Webview frontend
  - PostMessage communication bridge
  - React + Vite integration
  - Watch mode for fast development

- [Week 3](./week-03.md) - Multi-Canvas Architecture & Independent Contexts
  - ID-based singleton pattern (not global)
  - Multiple independent canvas instances
  - Canvas state persistence (.roopik/canvas-{id}.json)
  - Configurable performance limits
  - Crash isolation and sandboxing
  - Command system (openCanvas, newCanvas, showCanvases, closeAllCanvases)

---


**Note:** Each week's learnings are in separate files to keep them focused. We'll merge shorter weeks later if needed.
