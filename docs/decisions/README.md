# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records - documents that capture important architectural decisions made during the project.

## What is an ADR?

An ADR is a document that captures an important architectural decision made along with its context and consequences.

## Format

We use a simple format:

```markdown
# ADR-XXX: [Decision Title]

**Date**: YYYY-MM-DD
**Status**: [Proposed / Accepted / Deprecated / Superseded]
**Deciders**: [Who made the decision]

## Context

What is the issue we're facing? What factors are in play?

## Decision

What decision did we make?

## Consequences

What are the positive and negative consequences?

### Positive
- Pro 1
- Pro 2

### Negative
- Con 1
- Con 2

### Neutral
- Neutral 1

## Alternatives Considered

What other options did we consider?

### Alternative 1: [Name]
**Pros**: ...
**Cons**: ...
**Why not chosen**: ...

### Alternative 2: [Name]
...

## References

- Link 1
- Link 2
```

## Index of ADRs

| Number | Title | Status | Date |
|--------|-------|--------|------|
| 001 | [Use VS Code Fork as Foundation](001-vscode-fork.md) | Accepted | 2025-11-14 |
| ... | ... | ... | ... |

*New ADRs will be added as we make major decisions*

## When to Create an ADR

Create an ADR when:
- Making a significant architectural choice
- Choosing between multiple technical approaches
- Making a decision that's hard to reverse
- Making a decision that affects multiple parts of the system
- Making a decision that future contributors need to understand

Examples:
- "Should we use DOM rendering or Canvas 2D for the canvas?"
- "Which state management library should we use?"
- "Should we use esbuild or Vite for bundling?"
- "How should we handle code ↔ canvas sync?"
