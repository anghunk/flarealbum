# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**FlareAlbum** is a client-side Cloudflare R2 image hosting management tool. There is **no backend server** — all S3 operations happen directly from the browser using the AWS SDK v3 with user-provided credentials stored in localStorage.

## Tech Stack

- **Framework:** Vue 3 (Composition API with `<script setup>`)
- **Build Tool:** Vite 6
- **UI Library:** Ant Design Vue 3 (imported globally)
- **State Management:** Vuex 4 (defined inline in `src/main.js`)
- **Routing:** Vue Router 4 (history mode)
- **Cloud SDK:** AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)
- **Image Processing:** `browser-image-compression` (client-side WebP conversion)

## Development Commands

```bash
npm install    # Install dependencies
npm run dev    # Start dev server (Vite)
npm run build  # Production build
npm run preview # Preview production build locally
```

No test framework, linter, or formatter is configured.

## Architecture

### Directory Structure

```
src/
├── main.js              # Entry point: creates app, router, store, mounts
├── App.vue              # Root layout with sidebar navigation
├── style.css            # Global styles
├── views/
│   ├── Config.vue       # S3/R2 connection configuration form
│   ├── Upload.vue       # Image upload (drag-and-drop, batch, WebP conversion)
│   ├── Manage.vue       # File/folder browser with list/grid views, preview, delete
│   └── Settings.vue     # User preferences (copy format, upload path, custom domain, WebP quality)
├── services/
│   ├── s3Service.js     # S3 client wrapper (upload, delete, list, signed URLs, config persistence)
│   └── cacheService.js  # localStorage caching layer (file tree, URL cache, settings, 24h expiry)
└── router/
    └── index.js         # Route definitions (4 routes, `/` redirects to `/upload`)
```

### Key Architectural Patterns

1. **Vuex store is inline in `src/main.js`** — not in a separate store module. State includes `s3Config`, `userSettings`, `imageList`, `currentFolder`, `loading`.

2. **Multi-layer config persistence**: s3Service (base64 encoded) → cacheService → raw localStorage. Backward compatibility is maintained across all three layers.

3. **Aggressive localStorage caching** (`cacheService.js`): The entire S3 bucket structure is cached locally as a tree with per-path file lists and pre-signed URL cache (24h expiry). This reduces S3 API calls significantly.

4. **Custom domain support**: When configured, URLs use the custom domain directly instead of generating signed URLs.

5. **Route-level code splitting**: All view components are lazy-loaded via dynamic `import()`.

## Code Conventions

- Vue 3 Composition API with `<script setup>` syntax
- Component/file names: PascalCase
- JavaScript: ES6+ (`const`/`let`, arrow functions, template literals, destructuring)
- CSS: BEM naming convention, scoped styles, avoid deep nesting
- Git commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `chore:`)
