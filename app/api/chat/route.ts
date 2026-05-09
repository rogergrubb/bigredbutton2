import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { anthropic, DEFAULT_MODEL, type ChatMessage } from "@/lib/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  conversation_id: string;
  user_message: string;
  skill_id?: string | null;
};

/**
 * POST /api/chat
 *
 * Authenticates the Supabase session, persists the user's message, then streams a
 * Claude response back to the client. Persists the assistant message and usage
 * after streaming completes.
 *
 * The Anthropic API key NEVER leaves the server.
 */
export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "sk-ant-REPLACE_ME") {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { conversation_id, user_message, skill_id } = body;
  if (!conversation_id || !user_message) {
    return NextResponse.json({ error: "conversation_id and user_message required" }, { status: 400 });
  }

  // Verify conversation belongs to user (RLS will enforce, but be explicit).
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, skill_id")
    .eq("id", conversation_id)
    .single();
  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Resolve system prompt from skill (if any).
  let systemPrompt = "You are TheBRB, a sharp, no-fluff real-estate AI co-pilot built by SellFast.Now. Be direct, decisive, and concise. Always end with the recommended next action.";
  const effectiveSkillId = skill_id ?? conv.skill_id;
  if (effectiveSkillId) {
    const { data: skill } = await supabase
      .from("skills")
      .select("system_prompt")
      .eq("id", effectiveSkillId)
      .single();
    if (skill?.system_prompt) systemPrompt = skill.system_prompt;
  }

  // Persist the user's message FIRST so it shows up in history even if streaming fails.
  const { error: insertErr } = await supabase.from("messages").insert({
    conversation_id,
    user_id: user.id,
    role: "user",
    content: user_message,
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Load conversation history for context (last 30 messages).
  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversation_id)
    .order("created_at", { ascending: true })
    .limit(30);

  const messages: ChatMessage[] = (history ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // Stream from Anthropic.
  const encoder = new TextEncoder();
  let assistantText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = await anthropic.messages.stream({
          model: DEFAULT_MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          messages,
        });

        for await (const event of claudeStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const chunk = event.delta.text;
            assistantText += chunk;
            controller.enqueue(encoder.encode(chunk));
          } else if (event.type === "message_delta" && event.usage) {
            outputTokens = event.usage.output_tokens ?? outputTokens;
          } else if (event.type === "message_start" && event.message?.usage) {
            inputTokens = event.message.usage.input_tokens ?? 0;
            outputTokens = event.message.usage.output_tokens ?? 0;
          }
        }

        // Persist assistant message + usage after stream completes.
        await supabase.from("messages").insert({
          conversation_id,
          user_id: user.id,
          role: "assistant",
          content: assistantText,
          tokens_in: inputTokens,
          tokens_out: outputTokens,
        });

        // Update conversation timestamp + auto-title from first user message if untitled.
        await supabase
          .from("conversations")
          .update({
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversation_id);

        // Log usage
        await supabase.from("usage_log").insert({
          user_id: user.id,
          conversation_id,
          model: DEFAULT_MODEL,
          tokens_in: inputTokens,
          tokens_out: outputTokens,
          // Sonnet 4.6 pricing: $3/MTok in, $15/MTok out (as of 2025-2026)
          cost_cents: (inputTokens * 0.0003 + outputTokens * 0.0015).toFixed(4),
        });

        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(encoder.encode(`\n\n[error: ${msg}]`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
