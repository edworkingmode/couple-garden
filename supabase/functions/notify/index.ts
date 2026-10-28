// 推播通知：資料庫有新的花、申請、小黑花或「想你」時，通知另一半。
// 由 Supabase 的 Database Webhook 呼叫（cg_entries 的新增與更新、cg_pings 的新增）。
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
webpush.setVapidDetails("mailto:noreply@couple-garden.app", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

async function nick(id: string) {
  const { data } = await db.from("cg_profiles").select("nickname").eq("id", id).maybeSingle();
  return data?.nickname || "對方";
}
async function other(coupleId: string, id: string) {
  const { data } = await db.from("cg_profiles").select("id").eq("couple_id", coupleId).neq("id", id);
  return data?.[0]?.id as string | undefined;
}

// 決定要通知誰、寫什麼；不需要通知就回傳 null
async function plan(table: string, type: string, r: any, old: any) {
  if (table === "cg_pings" && type === "INSERT") {
    const to = await other(r.couple_id, r.from_id);
    return to && { to, title: "💗 " + await nick(r.from_id) + "想你了", body: "打開花園看看吧", tag: "miss" };
  }
  if (table === "cg_checkins" && type === "INSERT") {
    const to = await other(r.couple_id, r.user_id);
    return to && { to, title: (r.mood || "💌") + " " + await nick(r.user_id) + "報平安", body: r.note || "今天平安", tag: "checkin" };
  }
  if (table === "cg_rewards" && type === "INSERT") {
    return { to: r.owner, title: "🎁 " + await nick(r.created_by) + "幫你新增獎勵", body: r.title + "（" + r.cost + " 朵）", tag: "reward" };
  }
  if (table === "cg_reward_claims") {
    if (type === "INSERT") {
      const to = await other(r.couple_id, r.owner);
      return to && { to, title: "🎁 " + await nick(r.owner) + "想兌換獎勵", body: r.title + "（" + r.cost + " 朵）", tag: "claim" };
    }
    if (type === "UPDATE" && old && old.status !== r.status) {
      const by = await other(r.couple_id, r.owner);
      const who = by ? await nick(by) : "對方";
      if (r.status === "confirmed") return { to: r.owner, title: "🎁 兌換成立", body: who + "答應了：" + r.title, tag: "claim-ok" };
      if (r.status === "rejected") return { to: r.owner, title: "兌換先暫停", body: r.reply || who + "說先不要", tag: "claim-no" };
    }
    return null;
  }
  if (table !== "cg_entries") return null;
  const from = await nick(r.created_by);
  if (type === "INSERT") {
    if (r.kind === "request" && r.status === "pending") {
      const to = await other(r.couple_id, r.created_by);
      return to && { to, title: from + "申請一朵花", body: r.note || "等你確認", tag: "req" };
    }
    if (r.kind === "gift") return { to: r.owner, title: "🌹 " + from + "送你一朵花", body: r.note || "", tag: "gift" };
    if (r.kind === "black") return { to: r.owner, title: "🖤 " + from + "給你一朵小黑花", body: r.note || "", tag: "black" };
    return null;
  }
  if (type === "UPDATE" && old && old.status !== r.status) {
    const ownerNick = await nick(r.owner);
    const partnerOfOwner = await other(r.couple_id, r.owner);
    if (r.status === "confirmed" && old.status === "pending") return { to: r.owner, title: "🌹 花種下了", body: (partnerOfOwner ? await nick(partnerOfOwner) : "對方") + "確認了：" + (r.note || ""), tag: "ok" };
    if (r.status === "rejected") return { to: r.owner, title: "這朵花被退回了", body: r.reply || r.note || "", tag: "no" };
    if (r.status === "appeal") return { to: r.created_by, title: ownerNick + "申訴了一朵小黑花", body: r.reply || "", tag: "appeal" };
    if (r.status === "revoked") return { to: r.owner, title: "小黑花撤銷了", body: "申訴成功", tag: "revoked" };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-hook-secret") !== Deno.env.get("HOOK_SECRET")) return new Response("forbidden", { status: 403 });
  const { table, type, record, old_record } = await req.json();
  const msg = await plan(table, type, record, old_record);
  if (!msg) return new Response("skip");
  const { data: subs } = await db.from("cg_push_subs").select("*").eq("user_id", msg.to);
  let sent = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg));
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await db.from("cg_push_subs").delete().eq("id", s.id);   // 手機取消訂閱了
    }
  }
  return new Response("sent " + sent);
});
