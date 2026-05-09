import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatShell } from "@/components/ChatShell";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/chat");

  // Load skills + recent conversations server-side for fast first paint.
  const [{ data: skills }, { data: conversations }] = await Promise.all([
    supabase
      .from("skills")
      .select("id, name, description, emoji, intake_schema, display_order")
      .eq("enabled", true)
      .order("display_order", { ascending: true }),
    supabase
      .from("conversations")
      .select("id, title, skill_id, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <ChatShell
      userEmail={user.email ?? ""}
      skills={skills ?? []}
      initialConversations={conversations ?? []}
    />
  );
}
