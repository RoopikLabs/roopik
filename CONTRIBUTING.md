# Contributing to Roopik IDE

Welcome, and thank you for your interest in contributing to Roopik!

## Ways to Contribute

- Report bugs and request features via [GitHub Issues](https://github.com/RoopikLabs/roopik/issues)
- Submit pull requests for bug fixes or features
- Improve documentation
- Share feedback and ideas in [Discussions](https://github.com/RoopikLabs/roopik/discussions)

## Reporting Issues

Before creating a new issue, please search [existing issues](https://github.com/RoopikLabs/roopik/issues) to avoid duplicates.

When reporting a bug, include:
- Roopik version (Help > About)
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Screenshots or screen recordings if applicable
- Errors from Developer Tools (Help > Toggle Developer Tools)

## Development Setup

### Prerequisites
- Node.js (see `.nvmrc`)
- Python 3.11+
- Git

### Building from Source

```bash
# Clone
git clone https://github.com/RoopikLabs/roopik.git
cd roopik

# Install dependencies
npm install

# Watch (development)
npm run watch

# Build (production)
npm run gulp vscode-win32-x64       # Windows
npm run gulp vscode-darwin-arm64     # macOS
npm run gulp vscode-linux-x64       # Linux
```

### Building the Agent Dio Extension

```bash
cd extensions/roopik-roo
npm install
cd packages/types && npm install && npm run build && cd ../..
cd packages/build && npm install && npm run build && cd ../..
npm run build
```

## Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Test locally (build + run)
5. Commit with a clear message
6. Push and open a Pull Request

### PR Guidelines

- Keep PRs focused - one feature or fix per PR
- Include a clear description of what changed and why
- Add screenshots for UI changes
- Ensure the build passes before submitting

## Project Structure

- `src/vs/workbench/contrib/roopik/` — Core Roopik features (Canvas, Project,Browser, MCP, tools)
- `extensions/roopik-roo/` — Dio agent (built on Roo Code)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE.txt).
