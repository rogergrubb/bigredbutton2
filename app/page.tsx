import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/chat");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center safe-top safe-bottom">
      <div className="max-w-2xl">
        <div className="flex justify-center mb-8">
          <div className="w-32 h-32 rounded-full bg-brb-red shadow-red-glow animate-pulse-red flex items-center justify-center text-5xl font-black text-white">
            BRB
          </div>
        </div>
        <h1 className="text-5xl md:text-6xl font-black mb-4 tracking-tight">
          The <span className="text-brb-red">Big Red Button</span>
        </h1>
        <p className="text-lg md:text-xl text-brb-muted mb-10">
          Your real-estate AI co-pilot. Press it. The next move is handled.
          <br className="hidden md:block" />
          Lead qualifying, cold-call scripts, contract drafts, comps, follow-ups — six built-in plays.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/signup"
            className="px-8 py-4 rounded-full bg-brb-red hover:bg-brb-redHover transition text-white font-bold text-lg shadow-red-glow"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="px-8 py-4 rounded-full border border-brb-border hover:border-brb-red text-brb-text font-medium text-lg transition"
          >
            Sign In
          </Link>
        </div>
        <p className="mt-12 text-xs text-brb-muted">
          By SellFast.Now · v0.1
        </p>
      </div>
    </main>
  );
}
