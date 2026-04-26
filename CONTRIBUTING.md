# Contributing to Lumoravision

First off — thank you for taking the time to contribute! 🎉

## Table of Contents

- [Contributing to Lumoravision](#contributing-to-lumoravision)
  - [Table of Contents](#table-of-contents)
  - [Code of Conduct](#code-of-conduct)
  - [Getting Started](#getting-started)
  - [How to Contribute](#how-to-contribute)
    - [🐛 Bug Fixes](#-bug-fixes)
    - [✨ New Features](#-new-features)
    - [📖 Documentation](#-documentation)
  - [Development Setup](#development-setup)
    - [Project Structure](#project-structure)
    - [Key Constraints](#key-constraints)
  - [Pull Request Process](#pull-request-process)
  - [Commit Convention](#commit-convention)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold these standards.

---

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/lumoravision.git
   cd lumoravision
   ```
3. **Install** dependencies:
   ```bash
   npm install
   ```
4. **Start** the dev server:
   ```bash
   npm run dev
   # → http://localhost:5173
   ```

---

## How to Contribute

### 🐛 Bug Fixes
- Check [existing issues](https://github.com/tron4x/lumoravision/issues) first
- If none exists, open a new issue describing the bug before submitting a PR

### ✨ New Features
- Open an issue first to discuss the feature
- Small improvements (typos, minor UI tweaks) can go directly as a PR

### 📖 Documentation
- Always welcome — no issue needed for doc improvements

---

## Development Setup

```bash
# Install dependencies
npm install

# Start dev server (hot reload)
npm run dev

# Type check
npx tsc --noEmit

# Lint
npm run lint

# Production build
npm run build

# Preview production build
npm run preview
```

### Project Structure

```
src/
├── components/   # React components
├── hooks/        # Custom React hooks
├── utils/        # Pure utility functions
└── types/        # TypeScript type definitions
```

### Key Constraints

- **No backend** — everything must run 100% in the browser
- **No new runtime dependencies** unless absolutely necessary
- **No external API calls** — no telemetry, no analytics
- **TypeScript strict** — all new code must be fully typed
- **No `any`** — use proper types or generics

---

## Pull Request Process

1. Create a branch from `main`:
   ```bash
   git checkout -b feature/my-feature
   # or
   git checkout -b fix/my-bugfix
   ```

2. Make your changes and commit (see [Commit Convention](#commit-convention))

3. Make sure the build passes:
   ```bash
   npm run build
   ```

4. Push and open a Pull Request against `main`

5. Fill out the PR description:
   - What does this PR do?
   - How was it tested?
   - Screenshots (if UI changes)

6. Wait for review — feedback will be given within a few days

---

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>
```

| Type | When to use |
|:-----|:------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no logic change |
| `refactor` | Code restructure, no feature/fix |
| `perf` | Performance improvement |
| `chore` | Build, deps, config |

**Examples:**
```
feat: add image slideshow with fade/slide/zoom transitions
fix: remove infinite glowPulse animation causing high CPU usage
docs: add screenshots to README
perf: lazy-load object URLs on folder activation
```

---

## Reporting Bugs

When filing a bug report, please include:

- **Browser** and version (Chrome 124, Firefox 125, etc.)
- **OS** (macOS, Windows, Linux)
- **Steps to reproduce**
- **Expected behavior**
- **Actual behavior**
- **Screenshots** if applicable

→ [Open a Bug Report](https://github.com/tron4x/lumoravision/issues/new)

---

## Suggesting Features

Feature requests are welcome! Please describe:

- **The problem** you're trying to solve
- **Your proposed solution**
- **Alternatives** you've considered

→ [Open a Feature Request](https://github.com/tron4x/lumoravision/issues/new)

---

Thank you for making Lumoravision better! 🚀
