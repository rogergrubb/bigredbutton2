"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Skill = {
  id: string;
  name: string;
  description: string;
  emoji: string | null;
  intake_schema: { fields: Array<{ name: string; label: string; type: string; required?: boolean; options?: string[] }> } | null;
  display_order: number;
};

export type Conversation = {
  id: string;
  title: string | null;
  skill_id: string | null;
  created_at: string;
  updated_at: string;
};

type Message = { role: "user" | "assistant"; content: string };

export function ChatShell({
  userEmail,
  skills,
  initialConversations,
}: {
  userEmail: string;
  skills: Skill[];
  initialConversations: Conversation[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [skillForIntake, setSkillForIntake] = useState<Skill | null>(null);
  const [intakeValues, setIntakeValues] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function selectConversation(id: string) {
    setActiveConvId(id);
    setSkillForIntake(null);
    setSidebarOpen(false);
    const { data } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    setMessages(
      (data ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    );
  }

  function startSkill(skill: Skill) {
    if (skill.intake_schema?.fields?.length) {
      setSkillForIntake(skill);
      setIntakeValues({});
    } else {
      void newConversation(skill.id, skill.name);
    }
  }

  async function newConversation(skill_id: string | null, title: string | null) {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill_id, title }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error || "Failed to create conversation");
      return null;
    }
    setConversations((cur) => [json.conversation, ...cur]);
    setActiveConvId(json.conversation.id);
    setMessages([]);
    return json.conversation.id as string;
  }

  async function submitIntake(e: React.FormEvent) {
    e.preventDefault();
    if (!skillForIntake) return;
    const id = await newConversation(skillForIntake.id, skillForIntake.name);
    if (!id) return;
    const intakeText = skillForIntake.intake_schema!.fields
      .map((f) => `**${f.label}**: ${intakeValues[f.name] ?? "(not provided)"}`)
      .join("\n");
    setSkillForIntake(null);
    await sendMessage(intakeText, id, skillForIntake.id);
  }

  async function sendMessage(text: string, convIdOverride?: string, skillIdOverride?: string) {
    const convId = convIdOverride ?? activeConvId;
    if (!convId || !text.trim()) return;

    const newUserMsg: Message = { role: "user", content: text };
    setMessages((m) => [...m, newUserMsg, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: convId,
          user_message: text,
          skill_id: skillIdOverride ?? null,
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: `[error: ${err.error}]` };
          return copy;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } finally {
      setStreaming(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-screen bg-brb-bg">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:static z-40 h-full w-72 bg-brb-surface border-r border-brb-border flex flex-col transition-transform safe-top safe-bottom ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-4 border-b border-brb-border flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-brb-red flex items-center justify-center font-black text-white text-sm">
            BRB
          </div>
          <div className="flex-1">
            <div className="font-bold">TheBRB</div>
            <div className="text-xs text-brb-muted">SellFast.Now</div>
          </div>
        </div>

        <div className="p-3">
          <button
            onClick={() => {
              setActiveConvId(null);
              setMessages([]);
              setSkillForIntake(null);
              setSidebarOpen(false);
            }}
            className="w-full py-2.5 px-3 rounded-lg bg-brb-red hover:bg-brb-redHover text-white font-semibold text-sm transition"
          >
            + New chat
          </button>
        </div>

        <div className="px-3 pb-2 text-xs text-brb-muted uppercase tracking-wide">
          Recent
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {conversations.length === 0 && (
            <div className="text-sm text-brb-muted px-2 py-4">No conversations yet.</div>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => selectConversation(c.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate mb-1 transition ${
                activeConvId === c.id
                  ? "bg-brb-red/20 text-brb-text"
                  : "hover:bg-brb-border/40 text-brb-muted hover:text-brb-text"
              }`}
            >
              {c.title || "Untitled chat"}
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-brb-border">
          <div className="text-xs text-brb-muted mb-2 truncate">{userEmail}</div>
          <button
            onClick={signOut}
            className="w-full text-sm py-2 rounded-lg border border-brb-border hover:border-brb-red text-brb-text transition"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 p-3 border-b border-brb-border safe-top">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 rounded-lg border border-brb-border flex items-center justify-center"
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="flex-1 font-bold">TheBRB</div>
        </header>

        {/* Content */}
        {skillForIntake ? (
          <div className="flex-1 overflow-y-auto px-4 py-8 max-w-2xl w-full mx-auto">
            <button
              onClick={() => setSkillForIntake(null)}
              className="text-sm text-brb-muted hover:text-brb-text mb-4"
            >
              ← Back
            </button>
            <h2 className="text-2xl font-black mb-2">
              {skillForIntake.emoji} {skillForIntake.name}
            </h2>
            <p className="text-brb-muted mb-6">{skillForIntake.description}</p>
            <form onSubmit={submitIntake} className="space-y-4">
              {skillForIntake.intake_schema!.fields.map((f) => (
                <div key={f.name}>
                  <label className="block text-sm font-semibold mb-1">
                    {f.label}
                    {f.required && <span className="text-brb-red"> *</span>}
                  </label>
                  {f.type === "textarea" ? (
                    <textarea
                      required={f.required}
                      rows={4}
                      value={intakeValues[f.name] ?? ""}
                      onChange={(e) =>
                        setIntakeValues({ ...intakeValues, [f.name]: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-brb-surface border border-brb-border focus:border-brb-red focus:outline-none"
                    />
                  ) : f.type === "select" ? (
                    <select
                      required={f.required}
                      value={intakeValues[f.name] ?? ""}
                      onChange={(e) =>
                        setIntakeValues({ ...intakeValues, [f.name]: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-brb-surface border border-brb-border focus:border-brb-red focus:outline-none"
                    >
                      <option value="">Choose...</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required={f.required}
                      value={intakeValues[f.name] ?? ""}
                      onChange={(e) =>
                        setIntakeValues({ ...intakeValues, [f.name]: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-brb-surface border border-brb-border focus:border-brb-red focus:outline-none"
                    />
                  )}
                </div>
              ))}
              <button
                type="submit"
                className="w-full py-3 rounded-lg bg-brb-red hover:bg-brb-redHover transition text-white font-bold shadow-red-glow"
              >
                🔴 Press the Big Red Button
              </button>
            </form>
          </div>
        ) : !activeConvId ? (
          // Empty state — show skill picker
          <div className="flex-1 overflow-y-auto px-4 py-8">
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-8">
                <div className="inline-block w-20 h-20 rounded-full bg-brb-red shadow-red-glow animate-pulse-red flex items-center justify-center font-black text-white text-2xl mb-4">
                  BRB
                </div>
                <h1 className="text-3xl md:text-4xl font-black mb-2">What's the play?</h1>
                <p className="text-brb-muted">Pick a skill, or start a free-form chat.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {skills.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => startSkill(s)}
                    className="text-left p-4 rounded-xl bg-brb-surface border border-brb-border hover:border-brb-red transition group"
                  >
                    <div className="text-2xl mb-2">{s.emoji}</div>
                    <div className="font-bold mb-1 group-hover:text-brb-red transition">
                      {s.name}
                    </div>
                    <div className="text-sm text-brb-muted">{s.description}</div>
                  </button>
                ))}
              </div>
              <div className="mt-6 text-center">
                <button
                  onClick={() => newConversation(null, "New chat")}
                  className="text-sm text-brb-muted hover:text-brb-text underline"
                >
                  or start a free-form chat →
                </button>
              </div>
            </div>
          </div>
        ) : (
          // Active conversation
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
              <div className="max-w-3xl mx-auto space-y-4">
                {messages.length === 0 && (
                  <div className="text-center text-brb-muted py-12">
                    Press the button below to start.
                  </div>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] px-4 py-3 rounded-2xl whitespace-pre-wrap leading-relaxed ${
                        m.role === "user"
                          ? "bg-brb-red text-white rounded-br-sm"
                          : "bg-brb-surface border border-brb-border rounded-bl-sm"
                      }`}
                    >
                      {m.content || (streaming && i === messages.length - 1 ? "..." : "")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-brb-border p-4 safe-bottom">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendMessage(input);
                }}
                className="max-w-3xl mx-auto flex gap-2"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message..."
                  disabled={streaming}
                  className="flex-1 px-4 py-3 rounded-full bg-brb-surface border border-brb-border focus:border-brb-red focus:outline-none disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={streaming || !input.trim()}
                  className="px-6 py-3 rounded-full bg-brb-red hover:bg-brb-redHover disabled:opacity-50 transition text-white font-bold"
                >
                  {streaming ? "..." : "Send"}
                </button>
              </form>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
