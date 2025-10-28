# Repository Guidelines

## Project Structure & Module Organization
- `app/app.vue` holds the root layout; add route components and UI modules under `app/`.
- `app/assets/css/main.css` imports Tailwind CSS and Nuxt UI tokens; extend shared styles here.
- `amplify/` tracks AWS Amplify backend resources (auth, data). Commit updates alongside the feature that needs them.
- `public/` serves static assets verbatim. Avoid runtime secrets or compiled output here.
- `.nuxt/` is generated when you build or run dev; never edit it manually.

## Build, Test, and Development Commands
- `pnpm install` aligns local dependencies with `pnpm-lock.yaml`.
- `pnpm dev` starts the Nuxt 4 dev server with HMR.
- `pnpm build` produces the production bundle in `.nuxt/`.
- `pnpm preview` runs the built bundle locally for smoke checks.
- `pnpm generate` pre-renders static routes.
- `pnpm exec nuxt test` executes the Nuxt Test Utils suite once tests are present.

## Coding Style & Naming Conventions
- Vue Single File Components with `<script setup>` and TypeScript are preferred.
- Respect ESLint stylistic rules from `nuxt.config.ts`: two-space indentation, single quotes, and no semicolons.
- Use kebab-case filenames for Vue components, camelCase for composables and utilities, and SCREAMING_SNAKE_CASE for environment variables.
- Favor Tailwind utility classes and Nuxt UI primitives; only add custom CSS when a utility cannot express the layout.

## Component Usage
- Default to Nuxt UI components whenever possible before building custom UI elements.
- Consult the Nuxt UI MCP resources to confirm available props, slots, and usage patterns before extending or wrapping a component.
- Extend Nuxt UI components with slots or props rather than rewriting their behavior; only create bespoke components when Nuxt UI cannot cover the required interaction.

## Testing Guidelines
- Store specs in `tests/`, mirroring the `app/` structure, and suffix them with `.spec.ts`.
- Leverage Nuxt Test Utils (Vitest under the hood); import helpers from `@nuxt/test-utils/runtime`.
- Run `pnpm exec nuxt test --watch` during development; cover new routes and Amplify flows.
- Mock `aws-amplify` clients so CI does not hit live AWS services.

## Commit & Pull Request Guidelines
- Follow the concise, imperative style already in history (e.g., `add amplify`, `fix style`).
- Reference related issues or Amplify environment updates in the commit body when relevant.
- Pull requests should include a summary, test evidence (`pnpm exec nuxt test` output), UI screenshots when visuals change, and migration notes for Amplify stacks.
- Keep scope tight; split unrelated backend/frontend updates into separate PRs when possible.

## Security & Configuration Tips
- Store secrets in environment files or Amplify variables; never commit credentials.
- Rotate Amplify access keys routinely and document new configuration requirements in `README.md` or the PR description.
