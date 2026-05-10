# Albo Start MVP — fork doc

## Provenance

Ce template a été créé from-scratch by Studio Albo (Benjamin / Maël / Clément), 2026-05.

Il **n'est PAS** un fork de [`dyeoman2/tanstack-start-template`](https://github.com/dyeoman2/tanstack-start-template) — ce dernier est l'ancêtre de [`Albo-Club/albo-start-template`](https://github.com/Albo-Club/albo-start-template) (compliance-grade). Ce MVP est une réécriture minimale focalisée sur la vélocité.

## Pourquoi un nouveau template ?

Cf le [README de `Albo-Club/albo-start-template`](https://github.com/Albo-Club/albo-start-template) — pour 90% des MVPs Albo, le template compliance-grade est trop lourd (800 fichiers, MFA forcé, multi-tenant orgs, audit ledger). Ce MVP fait 45 fichiers et boote en < 3 min avec un signup → /app sans friction.

## Mode dual

Le script `scripts/albo-create-mvp.sh` détecte si tu es membre de `Albo-Club` sur GitHub :

- **Mode `albo`** : repo créé sous `Albo-Club/<name>`, email sender = `noreply@alboteam.com`, charte Albo activée
- **Mode `test`** (par défaut hors-Albo) : repo sous ton compte perso, email = `onboarding@resend.dev`, charte Albo gardée mais override-able

Tu peux forcer avec `--mode albo` ou `--mode test`.

## Charte graphique Albo

Pré-appliquée dans `src/styles/albo-brand.css` :

- **Couleurs** : Primary `#CD4D28` (orange), Neutral `#F4F3EF`, Dark `#000000`, Grey `#979AB4`, accents Sec1 `#FBE055` (jaune), Sec2 `#D2D0F4` (lavande), Sec3 `#84CD96` (vert)
- **Fonts** : Display Leitura News (à fournir, fallback Playfair Display), Body Inter
- **Radius** : 9px partout
- Source : charte Albo Studio, figée 2026-05

External users : override en éditant `src/styles/albo-brand.css` ou en supprimant le fichier (defaults shadcn neutral prennent le relais).

## Suivi upstream

Pas de upstream à tracker ici (template from-scratch). Les deps individuelles peuvent être bumpées via `pnpm update --interactive`.

## Non-négociables Albo

Ce template doit toujours :

- ✅ Booter en < 3 min via `albo-create-mvp.sh`
- ✅ Signup email + password → /app direct au premier essai
- ✅ AI chat sidebar fonctionner avec n'importe quel provider LLM (Anthropic, OpenAI, OpenRouter, Google)
- ✅ Tool-calling read direct + write avec confirmation
- ✅ Charte Albo appliquée par défaut (override-able)
- ✅ Open-source friendly (n'importe quel dev externe peut le fork sans toucher l'infra Albo)

Si une feature ajoutée casse une de ces invariants, c'est un bug.

## Quel template pour quel projet ?

| Projet | Template |
|---|---|
| MVP rapide solo | `albo-start-mvp` ✅ |
| Prototype B2B SaaS simple | `albo-start-mvp` ✅ |
| Outil interne Albo | `albo-start-mvp` ✅ |
| App AI avec data perso | `albo-start-mvp` ✅ (c'est sa raison d'être) |
| Client healthcare (HIPAA) | `albo-start-template` |
| Client fintech régulée | `albo-start-template` |
| Multi-tenant SaaS B2B avec RBAC complexe | `albo-start-template` (ou enrichir le MVP) |

## Stock — features prêtes à add per-project

- **Mastra** workflows durables : `pnpm add @mastra/core @get-convex/mastra`
- **Stripe** : `pnpm add @stripe/stripe-js stripe` + Convex webhook action
- **MFA TOTP** : enable Better Auth `twoFactor` plugin
- **Multi-tenant orgs** : enable Better Auth `organization` plugin
- **File uploads** : Convex Storage + drag-and-drop component
- **Voice AI** : `pnpm add @gladiaio/sdk` (transcription) ou OpenAI Whisper
- **MCP server** pour exposer les data du projet à des agents externes
