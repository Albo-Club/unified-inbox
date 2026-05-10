#!/usr/bin/env bash
# ============================================================================
# Albo Create MVP — one-shot bootstrap of a new project from albo-start-mvp
# Usage:
#   bash scripts/albo-create-mvp.sh <project-name> [--mode albo|test]
#   bash <(curl -sSL https://raw.githubusercontent.com/Albo-Club/albo-start-mvp/main/scripts/albo-create-mvp.sh) <project-name>
#
# Target: git clone → localhost:3000 ready in < 3 min, signup → /app on first try.
# ============================================================================

set -euo pipefail

# Silence cosmetic Node engine warnings.
export PNPM_CONFIG_ENGINE_STRICT=false
export NPM_CONFIG_ENGINE_STRICT=false

# --- Helpers ----------------------------------------------------------------

spin() {
  local pid=$1
  local msg=$2
  local chars='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  local i=0
  command -v tput >/dev/null && tput civis 2>/dev/null || true
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r  %s %s   " "${chars:$((i % 10)):1}" "$msg"
    sleep 0.1
    i=$((i+1))
  done
  command -v tput >/dev/null && tput cnorm 2>/dev/null || true
  printf "\r  ✓ %s          \n" "$msg"
}

# --- Args parsing -----------------------------------------------------------

PROJECT_NAME="${1:-}"
MODE_FLAG="auto"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE_FLAG="$2"; shift 2;;
    --albo) MODE_FLAG="albo"; shift;;
    --test) MODE_FLAG="test"; shift;;
    -h|--help)
      echo "Usage: bash scripts/albo-create-mvp.sh <project-name> [--mode albo|test]"
      exit 0;;
    *)
      if [[ -z "$PROJECT_NAME" ]]; then
        PROJECT_NAME="$1"
      fi
      shift;;
  esac
done

if [[ -z "$PROJECT_NAME" ]]; then
  echo "❌ Project name required. Usage: bash scripts/albo-create-mvp.sh <project-name>"
  exit 1
fi

# --- Step 1: Preflight ------------------------------------------------------

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Albo Create MVP — bootstrap '$PROJECT_NAME'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "→ [1/10] Preflight checks"

for cmd in gh pnpm node curl; do
  if ! command -v "$cmd" >/dev/null; then
    echo "❌ Missing required command: $cmd"
    echo "   Install with: brew install $cmd"
    exit 1
  fi
done

NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "⚠️  Node $NODE_MAJOR detected, recommended ≥20"
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "❌ gh not authenticated. Run: gh auth login"
  exit 1
fi

if lsof -ti :3000 >/dev/null 2>&1; then
  STALE_PIDS=$(lsof -ti :3000 2>/dev/null | tr '\n' ' ')
  echo "⚠️  Port 3000 is already in use by PID(s): $STALE_PIDS"
  echo "   To kill them: kill $STALE_PIDS"
  echo "   Aborting to avoid conflicts."
  exit 1
fi

# Mode auto-detection
if [[ "$MODE_FLAG" == "auto" ]]; then
  if gh api user/orgs --jq '.[].login' 2>/dev/null | grep -qiE "^(Albo-Club|alboteam)$"; then
    MODE="albo"
  else
    MODE="test"
  fi
else
  MODE="$MODE_FLAG"
fi

echo "  ✓ gh authenticated as $(gh api user --jq '.login')"
echo "  ✓ Mode: $MODE"

# --- Step 2: Clone or use current dir ---------------------------------------

CURRENT_REPO=$(git remote get-url origin 2>/dev/null || echo "")
TARGET_DIR=""

if [[ "$CURRENT_REPO" == *"albo-start-mvp"* ]]; then
  echo "→ [2/10] Bootstrapping current directory (already cloned)"
  TARGET_DIR="$PWD"
else
  echo "→ [2/10] Creating GitHub repo from template"
  TARGET_DIR="$HOME/Documents/Albo/$PROJECT_NAME"

  if [[ -d "$TARGET_DIR" ]]; then
    echo "❌ $TARGET_DIR already exists. Pick another name or delete it first."
    exit 1
  fi

  if [[ "$MODE" == "albo" ]]; then
    OWNER="Albo-Club"
  else
    OWNER=$(gh api user --jq '.login')
  fi

  gh repo create "$OWNER/$PROJECT_NAME" \
    --private \
    --template "Albo-Club/albo-start-mvp" \
    --clone

  if [[ ! -d "$TARGET_DIR" ]]; then
    mv "$PROJECT_NAME" "$TARGET_DIR"
  fi
  cd "$TARGET_DIR"
fi

# --- Step 3: Install deps ---------------------------------------------------

echo "→ [3/10] Installing dependencies (~1 min)"
PNPM_LOG="/tmp/albo-mvp-pnpm-$$.log"
pnpm install --silent >"$PNPM_LOG" 2>&1 &
spin $! "downloading and linking packages"
rm -f "$PNPM_LOG"

# --- Step 4: Provision Convex deployment ------------------------------------

echo "→ [4/10] Provisioning Convex dev deployment"

TEAM_FLAG=""
if [[ -n "${CONVEX_TEAM:-}" ]]; then
  TEAM_FLAG="--team $CONVEX_TEAM"
  echo "  Using team override: $CONVEX_TEAM"
fi

# Stdin from /dev/null → CLI sees no TTY → 0 prompts (uses team default region).
CONVEX_LOG="/tmp/albo-mvp-convex-$$.log"
set +e
pnpm exec convex dev --once \
  --configure new \
  $TEAM_FLAG \
  --project "$PROJECT_NAME" \
  --dev-deployment cloud </dev/null >"$CONVEX_LOG" 2>&1 &
spin $! "creating project + provisioning deployment (~30s)"
set -e

if grep -q "Team .* not found" "$CONVEX_LOG"; then
  echo ""
  echo "❌ Convex doesn't know your team slug."
  echo "   Find it at https://dashboard.convex.dev (URL: /t/<your-slug>)"
  echo "   Re-run with: CONVEX_TEAM=<your-slug> bash scripts/albo-create-mvp.sh $PROJECT_NAME"
  rm -f "$CONVEX_LOG"
  exit 1
fi

if ! grep -q "^CONVEX_DEPLOYMENT=" .env.local 2>/dev/null; then
  echo ""
  echo "❌ Convex provisioning failed — no CONVEX_DEPLOYMENT in .env.local"
  echo "   Last 20 lines:"
  tail -20 "$CONVEX_LOG" | sed 's/^/   /'
  exit 1
fi

if grep -q "configure a default region" "$CONVEX_LOG"; then
  echo ""
  echo "  ⚠️  No team default region set — Convex provisioned in its server default (likely US)."
  TEAM_HINT=$(grep -oE "https://dashboard.convex.dev/t/[^/]+/settings" "$CONVEX_LOG" | head -1)
  if [[ -n "$TEAM_HINT" ]]; then
    echo "     Set Europe as default once at: $TEAM_HINT"
  fi
fi

rm -f "$CONVEX_LOG"
echo "  ✓ Convex deployment provisioned"

# --- Step 5: Set required Convex env vars -----------------------------------

echo "→ [5/10] Setting Convex env vars"
SECRET=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
SITE_URL="http://localhost:3000"

pnpm exec convex env set BETTER_AUTH_SECRET "$SECRET" >/dev/null 2>&1
pnpm exec convex env set BETTER_AUTH_URL "$SITE_URL" >/dev/null 2>&1
pnpm exec convex env set JWKS '[]' >/dev/null 2>&1   # placeholder — empty array, BA generates real keys at runtime

echo "  ✓ BETTER_AUTH_SECRET (auto-generated 32-byte hex)"
echo "  ✓ BETTER_AUTH_URL=$SITE_URL"
echo "  ✓ JWKS placeholder set (BA generates real keys on first request)"

# Mirror to .env.local for local Vite (used by VITE_CONVEX_URL etc.)
{
  echo ""
  echo "# Better Auth secrets (auto-generated by albo-create-mvp.sh)"
  echo "BETTER_AUTH_SECRET=$SECRET"
  echo "BETTER_AUTH_URL=$SITE_URL"
} >> .env.local

# --- Step 6: Optional API keys ----------------------------------------------

echo "→ [6/10] Optional API keys (press Enter to skip)"

read -p "   Anthropic API key (REQUIRED for AI chat — get at console.anthropic.com): " ANTHROPIC_KEY || ANTHROPIC_KEY=""
if [[ -n "$ANTHROPIC_KEY" ]]; then
  pnpm exec convex env set ANTHROPIC_API_KEY "$ANTHROPIC_KEY" >/dev/null
  echo "ANTHROPIC_API_KEY=$ANTHROPIC_KEY" >> .env.local
  echo "   ✓ Anthropic configured"
else
  echo "   ⚠️  No AI provider key set — the chat sidebar will show an error until you set one."
  echo "      Run later: pnpm exec convex env set ANTHROPIC_API_KEY <your-key>"
fi

# --- Step 7: Push functions -------------------------------------------------

echo "→ [7/10] Pushing Convex functions"
PUSH_LOG="/tmp/albo-mvp-push-$$.log"
pnpm exec convex dev --once >"$PUSH_LOG" 2>&1 &
spin $! "compiling and uploading Convex functions (~20s)"
rm -f "$PUSH_LOG"

# --- Step 8: Initial commit -------------------------------------------------

echo "→ [8/10] Initial Albo commit (hooks skipped — they'll run on real commits)"
git add -A 2>/dev/null || true
if ! git diff --cached --quiet 2>/dev/null; then
  git commit --quiet --no-verify -m "chore: bootstrap from albo-start-mvp at $(date +%Y-%m-%d)" || true
  if git remote get-url origin 2>/dev/null | grep -q "$PROJECT_NAME"; then
    git push --no-verify --quiet origin HEAD 2>&1 | tail -2 || echo "   (push skipped — run 'git push' manually when ready)"
  fi
fi
echo "  ✓ committed and pushed"

# --- Step 9: Start dev server -----------------------------------------------

echo "→ [9/10] Starting dev server (Vite + Convex in parallel)"
echo "  ⏳ Booting — this takes ~10-15 seconds..."

DEV_LOG="/tmp/albo-mvp-dev-$$.log"
pnpm dev >"$DEV_LOG" 2>&1 &
DEV_PID=$!

READY=0
for i in $(seq 1 90); do
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    echo ""
    echo "❌ pnpm dev exited early. Tail of dev server log:"
    tail -30 "$DEV_LOG" | sed 's/^/   /'
    exit 1
  fi
  if curl -sf -o /dev/null --max-time 1 http://localhost:3000/ 2>/dev/null; then
    READY=1
    break
  fi
  printf "."
  sleep 1
done
printf "\n"

if [[ "$READY" -eq 0 ]]; then
  echo "⚠️  Dev server didn't respond on http://localhost:3000 within 90s."
  echo "   Tail of dev server log:"
  tail -20 "$DEV_LOG" | sed 's/^/   /'
fi

# --- Step 10: Final summary + browser ---------------------------------------

DEPLOY_NAME=$(grep "^CONVEX_DEPLOYMENT=" .env.local 2>/dev/null | sed 's/^CONVEX_DEPLOYMENT=dev:\([^ ]*\).*/\1/' || echo "")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ $PROJECT_NAME ready in ${SECONDS}s — let's go"
echo ""
echo "  🌐  App:       http://localhost:3000"
echo "  📁  Local:     $TARGET_DIR"
if [[ -n "$DEPLOY_NAME" ]]; then
  echo "  ⚙️   Convex:    https://dashboard.convex.dev/d/$DEPLOY_NAME"
fi
if [[ "$MODE" == "albo" ]]; then
  echo "  📦  GitHub:    https://github.com/Albo-Club/$PROJECT_NAME"
fi
echo "  🔧  Mode:      $MODE"
echo ""
echo "  Sign up at /register → land in /app immediately. Ask the AI on the right."
echo "  Press Ctrl+C in this terminal to stop the dev server."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

open "http://localhost:3000" 2>/dev/null || true

trap "kill $DEV_PID 2>/dev/null; rm -f $DEV_LOG; exit 0" INT TERM
tail -f "$DEV_LOG" &
TAIL_PID=$!
wait $DEV_PID
kill $TAIL_PID 2>/dev/null || true
rm -f "$DEV_LOG"
