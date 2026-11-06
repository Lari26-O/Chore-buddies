// Chore Buddies · "I don't get it" helper (optional)
// Lets the app ask Claude for a short, kid-friendly hint when it runs on your own website.
// Only signed-in family accounts can call it (Supabase checks the login token).
//
// SETUP (about 5 minutes):
//   1. Get an API key at console.anthropic.com (pay as you go; each hint costs a tiny fraction of a cent).
//   2. In Supabase: Edge Functions → Secrets → add ANTHROPIC_API_KEY = your key.
//   3. Edge Functions → Deploy a new function → name it "helper" → paste this file → Deploy.
//      (Or with the Supabase CLI: supabase functions deploy helper)
// The key stays on Supabase's server. It is never sent to the phones.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const cut = (v: unknown, n: number) => String(v ?? "").slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json();
    const age = Math.max(3, Math.min(14, Number(b.age) || 7));
    const choices: string[] = Array.isArray(b.choices) ? b.choices.slice(0, 4).map((c: unknown) => cut(c, 60)) : [];
    const ok = Number(b.ok);
    const tried: string[] = Array.isArray(b.tried) ? b.tried.slice(0, 4).map((c: unknown) => cut(c, 60)) : [];
    const system = `You are ${cut(b.name, 20) || "a teacher"}, a gentle, cheerful teacher inside a kids' learning game called Chore Buddies. You only help with the one question you are given. Reply with 1 to 3 very short sentences using simple words a ${age}-year-old knows${b.young ? " (the child cannot read yet, so your words are read aloud)" : ""}. Be warm and encouraging. Help them think it through (counting on fingers, picturing things, sounding words out) instead of giving the answer. If they have asked 3 or more times you may walk them almost all the way there. If the child says something unrelated, sad, scary or unsafe, or asks personal questions, kindly tell them to talk to a grown-up they trust, then bring them back to the question. Never ask for personal information. Plain text only: no emojis, no lists, no markdown.`;
    const user = `Lesson clue: ${cut(b.clue, 300) || "(none)"}
Question: ${cut(b.q, 200)}
Choices: ${choices.join(" | ")}
Correct answer (do NOT say it outright): ${choices[ok] ?? "unknown"}
Answers already tried: ${tried.join(", ") || "none"}
Times asked for help: ${Number(b.n) || 1}
The child says: "${cut(b.ask, 200)}"`;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 200, system, messages: [{ role: "user", content: user }] }),
    });
    const j = await r.json();
    const text = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join(" ").trim();
    return new Response(JSON.stringify({ text }), { headers: { ...cors, "content-type": "application/json" } });
  } catch (_e) {
    return new Response(JSON.stringify({ text: "" }), { status: 200, headers: { ...cors, "content-type": "application/json" } });
  }
});
