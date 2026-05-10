'use node';

import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, tool, type ModelMessage } from 'ai';
import { ConvexError, v } from 'convex/values';
import { z } from 'zod';
import { action } from './_generated/server';
import { api } from './_generated/api';
import { authComponent } from './auth';

/* ============================================================================
 * Multi-provider LLM resolver
 *
 * Picks whichever provider has its API key set in env, in priority order:
 *   1. OPENROUTER_API_KEY (most flexible, multi-model)
 *   2. ANTHROPIC_API_KEY  (best for tool-calling, default Albo recommendation)
 *   3. OPENAI_API_KEY
 *   4. GOOGLE_GENERATIVE_AI_API_KEY
 *
 * Override the default model via env: AI_MODEL_ID="claude-sonnet-4-5" etc.
 * ========================================================================= */

function getModel(modelOverride?: string) {
  const explicit = modelOverride ?? process.env.AI_MODEL_ID;

  if (process.env.OPENROUTER_API_KEY) {
    const router = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
    return router(explicit ?? 'anthropic/claude-3.5-sonnet');
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic(explicit ?? 'claude-sonnet-4-5-20250929');
  }
  if (process.env.OPENAI_API_KEY) {
    return openai(explicit ?? 'gpt-4o-mini');
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return google(explicit ?? 'gemini-2.0-flash-exp');
  }

  throw new ConvexError({
    code: 'NO_LLM_PROVIDER',
    message:
      'No LLM provider key set. Add ANTHROPIC_API_KEY (or OPENAI/OPENROUTER/GOOGLE) to your Convex env: pnpm exec convex env set ANTHROPIC_API_KEY <key>',
  });
}

const SYSTEM_PROMPT = `You are a personal productivity assistant inside the user's todo app.

You have tools to help the user manage their todos:
- READ tools (searchTodos, getTodoStats) — execute these directly to find or summarize.
- WRITE PROPOSAL tools (proposeCreateTodo, proposeUpdateTodo, proposeToggleTodo, proposeDeleteTodo) —
  these never execute directly. Each call returns a "pending" result, which the UI shows to the user
  as a Confirm/Cancel preview card. The user must confirm before the action takes effect.

Guidelines:
- Be concise. Bullet points and short sentences. No hedging.
- When the user asks to add/update/toggle/delete something, ALWAYS use the propose* tools — never claim you've done it directly.
- After proposing, briefly tell the user "I've prepared the change — confirm it above" and stop.
- When showing search results, group by done state if it helps and highlight overdue items.
- Mirror the user's language (default English).
- Today's date: ${new Date().toISOString().slice(0, 10)}.`;

/* ============================================================================
 * Action: sendMessage
 *
 * Single-turn-ish: the user sends the full message history; we run the LLM with
 * tools and return whatever new messages came out (assistant + tool calls + tool
 * results). The client appends them to its local thread and renders any pending
 * tool-call previews.
 *
 * Threading / persistence is intentionally OUT-OF-SCOPE for the MVP — keep state
 * in client memory. Add @convex-dev/agent thread persistence per project if you
 * need history across sessions.
 * ========================================================================= */

const messageSchema = v.object({
  role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system'), v.literal('tool')),
  content: v.string(),
});

export const sendMessage = action({
  args: {
    messages: v.array(messageSchema),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    text: string;
    pendingActions: Array<{
      toolCallId: string;
      type: 'create' | 'update' | 'toggle' | 'delete';
      payload: Record<string, unknown>;
    }>;
  }> => {
    // Auth check
    const authUser = await authComponent.safeGetAuthUser(ctx);
    if (!authUser) {
      throw new ConvexError({ code: 'UNAUTHENTICATED', message: 'Not signed in' });
    }

    const modelMessages: ModelMessage[] = args.messages.map((m) => {
      // ai SDK ModelMessage has limited roles per content type; coerce simply.
      if (m.role === 'system') return { role: 'system', content: m.content };
      if (m.role === 'assistant') return { role: 'assistant', content: m.content };
      // tool messages skipped — we re-run from user/assistant text only
      return { role: 'user', content: m.content };
    });

    const tools = {
      searchTodos: tool({
        description:
          'Search the user\'s todos by title/notes substring. Optionally filter by done state.',
        inputSchema: z.object({
          query: z.string().optional(),
          done: z.boolean().optional(),
          limit: z.number().int().min(1).max(50).optional().default(10),
        }),
        execute: async ({ query, done, limit }) => {
          return await ctx.runQuery(api.todos.search, { query, done, limit });
        },
      }),

      getTodoStats: tool({
        description: 'Get aggregate stats for the user: total / done / open / overdue counts.',
        inputSchema: z.object({}),
        execute: async () => {
          return await ctx.runQuery(api.todos.getMyStats, {});
        },
      }),

      proposeCreateTodo: tool({
        description:
          'Propose creating a new todo. Returns a pending preview that the user must confirm.',
        inputSchema: z.object({
          title: z.string().min(1),
          notes: z.string().optional(),
          dueAt: z.number().int().optional(),
        }),
        execute: async (input) => {
          return { pending: { type: 'create' as const, payload: input } };
        },
      }),

      proposeUpdateTodo: tool({
        description: 'Propose updating an existing todo. User must confirm.',
        inputSchema: z.object({
          id: z.string(),
          title: z.string().optional(),
          notes: z.string().optional(),
          dueAt: z.number().int().optional(),
        }),
        execute: async (input) => {
          return { pending: { type: 'update' as const, payload: input } };
        },
      }),

      proposeToggleTodo: tool({
        description: 'Propose toggling done state of a todo. User must confirm.',
        inputSchema: z.object({ id: z.string() }),
        execute: async (input) => {
          return { pending: { type: 'toggle' as const, payload: input } };
        },
      }),

      proposeDeleteTodo: tool({
        description: 'Propose deleting a todo. User must confirm.',
        inputSchema: z.object({ id: z.string() }),
        execute: async (input) => {
          return { pending: { type: 'delete' as const, payload: input } };
        },
      }),
    };

    const result = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: modelMessages,
      tools,
      stopWhen: ({ steps }) => steps.length >= 5,
    });

    // Extract pending tool calls from steps
    const pendingActions: Array<{
      toolCallId: string;
      type: 'create' | 'update' | 'toggle' | 'delete';
      payload: Record<string, unknown>;
    }> = [];
    for (const step of result.steps) {
      for (const toolResult of step.toolResults ?? []) {
        const out = toolResult.output as { pending?: { type: string; payload: unknown } };
        if (out && typeof out === 'object' && 'pending' in out && out.pending) {
          pendingActions.push({
            toolCallId: toolResult.toolCallId,
            type: out.pending.type as 'create' | 'update' | 'toggle' | 'delete',
            payload: (out.pending.payload ?? {}) as Record<string, unknown>,
          });
        }
      }
    }

    return {
      text: result.text,
      pendingActions,
    };
  },
});
