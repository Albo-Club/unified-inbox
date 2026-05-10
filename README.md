# Albo Start MVP

**AI-first MVP scaffold by [Studio Albo](https://alboteam.com).** Bootstrap a deployable AI-powered SaaS in under 3 minutes — auth, real-time DB, AI chat with tool-calling, all wired up.

```bash
bash <(curl -sSL https://raw.githubusercontent.com/Albo-Club/albo-start-mvp/main/scripts/albo-create-mvp.sh) my-app
```

## What you get

- **Email + password signup** → instant access to `/app`. No forced MFA, no forced email verification, no friction.
- **Real-time todos with notes** as a demo feature, fully wired to Convex's reactive queries.
- **AI chat sidebar** persistent on the right side of every authenticated page. The AI can:
  - **Read** your todos (search, summarize, count, filter) — answers like "what's on my plate?" instantly.
  - **Write** your todos (create, update, toggle, delete) — but every write asks for your confirmation first via an inline preview card.
- **First user becomes admin** automatically, with a minimal `/app/admin` page (user list, basic stats).
- **Model-agnostic LLM** via the Vercel AI SDK — set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or `GOOGLE_GENERATIVE_AI_API_KEY` and you're good. Switch providers without touching code.

## Stack

- [TanStack Start](https://tanstack.com/start) (Vite + React 19, file-based routing, SSR)
- [Convex](https://convex.dev) (real-time DB, queries, mutations, actions, components)
- [Better Auth](https://better-auth.com) via [`@convex-dev/better-auth`](https://github.com/erquhart/convex-better-auth)
- [Vercel AI SDK](https://sdk.vercel.ai) (`ai` + `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@openrouter/ai-sdk-provider`)
- [`@convex-dev/agent`](https://github.com/get-convex/agent) for persistent chat threads + memory
- [`@convex-dev/resend`](https://github.com/get-convex/resend) for transactional emails
- [shadcn/ui](https://ui.shadcn.com) + Tailwind v4
- TanStack React Query + React Form + Zod

## Prerequisites (one time per machine)

```bash
brew install gh pnpm node
gh auth login
```

You'll also need:
- A free [Convex](https://dashboard.convex.dev) account (the bootstrap script creates a project for you)
- An [Anthropic API key](https://console.anthropic.com) (or OpenAI/OpenRouter/Google — any one works)
- Optional: [Resend](https://resend.com) for emails (only if you flip `requireEmailVerification: true` in your project)

## Two modes — Albo team vs external

The bootstrap script auto-detects whether you're a member of the GitHub `Albo-Club` org and switches behavior:

| | **Albo mode** (Albo-Club member) | **Test mode** (everyone else) |
|---|---|---|
| New repo created under | `Albo-Club/<name>` | `<your-github>/<name>` |
| Default email sender (if email verif enabled) | `noreply@alboteam.com` | `onboarding@resend.dev` |
| Convex project on | Your team | Your team |
| Brand CSS | Albo charte (orange #CD4D28, Inter + Playfair, 9px radius) | Same — override `src/styles/albo-brand.css` |

You can force a mode with `--mode albo` or `--mode test`.

> **External users:** the script never touches Albo infrastructure. Your project lives entirely on **your** GitHub, **your** Convex team, **your** AI provider account. Only the template repo itself is shared.

## Manual setup (no bootstrap script)

```bash
git clone https://github.com/Albo-Club/albo-start-mvp.git my-app
cd my-app
pnpm install
cp .env.example .env.local
# Fill in BETTER_AUTH_SECRET, ANTHROPIC_API_KEY (or another LLM key)
pnpm exec convex dev --once --configure new
pnpm dev
```

Then open http://localhost:3000.

## When to use this template vs `Albo-Club/albo-start-template`

| Use **albo-start-mvp** (this) when... | Use **albo-start-template** when... |
|---|---|
| Building a quick MVP or prototype | Building for a regulated client (healthcare, fintech) |
| You want one user role (or simple admin) | You need multi-tenant orgs with RBAC |
| You want a single-user dashboard with AI | You need HIPAA/SOC2/NIST compliance baseline |
| 90% of Albo projects | 10% of Albo projects |

When you outgrow this template — e.g. a client needs SOC2 — you can either upgrade individual features incrementally, or pivot to `albo-start-template` for the heavy machinery.

## What's NOT included (and how to add later)

- **MFA / passkey** — add `@better-auth/two-factor` + a `/app/settings/security` page. Templated example available on request.
- **Multi-tenant organizations** — add the Better Auth `organization` plugin + an `organizations` table. ~1 day of work.
- **Stripe** — add `@stripe/stripe-js` + a Convex action for the webhook. ~half a day.
- **File uploads** — Convex has built-in storage; `useStorage()` hook + a Drag-and-drop component. ~2 hours.
- **Mastra durable workflows** — `pnpm add @mastra/core @get-convex/mastra`, follow Mastra docs.

## License

MIT. See [LICENSE](./LICENSE).

---

Built with care by [Studio Albo](https://alboteam.com). Forked / improved? Open a PR.
