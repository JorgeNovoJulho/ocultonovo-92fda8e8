import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "./useAuth";

type Money = number;

export interface CreatorLedgerEntry {
  id: string;
  created_at: string;
  type: "content" | "subscription" | "chat" | "withdrawal";
  status: string;
  related_title: string;
  buyer_name: string | null;
  gross_amount: Money;
  tax_amount: Money;
  platform_fee_amount: Money;
  affiliate_amount: Money;
  affiliate_name: string | null;
  creator_net_amount: Money;
  provider: string | null;
}

export interface CreatorContentMetric {
  post_id: string | null;
  title: string;
  sales_count: number;
  gross_amount: Money;
  net_amount: Money;
}

export interface CreatorFinancialDashboardData {
  profile_id: string;
  creator_name: string;
  username: string | null;
  plan_type: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  account_status: string | null;
  is_verified: boolean;
  available_balance: Money;
  pending_balance: Money;
  withdrawn_total: Money;
  gross_total: Money;
  net_total: Money;
  tax_total: Money;
  platform_fee_total: Money;
  affiliate_total: Money;
  chat_total: Money;
  content_total: Money;
  subscriptions_total: Money;
  total_sales: number;
  average_ticket: Money;
  next_release_at: string | null;
  pending_withdrawals: number;
  ledger: CreatorLedgerEntry[];
  content_metrics: CreatorContentMetric[];
  withdrawals: any[];
  pending_releases: any[];
}

const money = (value: unknown) => Number(value || 0);

const releaseToStatus = (releaseStatus?: string | null, txStatus?: string | null) => {
  const normalizedRelease = String(releaseStatus || "").toLowerCase();
  const normalizedTx = String(txStatus || "").toLowerCase();

  if (["failed", "refunded", "canceled", "cancelled"].includes(normalizedTx)) return normalizedTx;
  if (["withdrawn", "paid"].includes(normalizedRelease)) return normalizedRelease;
  if (["available", "released", "completed"].includes(normalizedRelease)) return "available";
  if (["pending", "scheduled", "locked"].includes(normalizedRelease)) return "pending";
  if (normalizedTx === "completed") return "paid";
  return normalizedTx || normalizedRelease || "pending";
};

const resolveEntryType = (txType?: string | null): CreatorLedgerEntry["type"] => {
  if (txType === "subscription") return "subscription";
  if (txType === "chat" || txType === "priority_message") return "chat";
  if (txType === "withdrawal") return "withdrawal";
  return "content";
};

export function useCreatorFinancialDashboard() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["creator-financial-dashboard", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<CreatorFinancialDashboardData | null> => {
      if (!user?.id) return null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, name, username, plan_type, pix_key, pix_key_type, account_status, is_verified")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile?.id) return null;

      const profileId = profile.id as string;

      const [summaryRes, splitLogsRes, pendingRes, withdrawalsRes, chatRes] = await Promise.all([
        (supabase as any)
          .from("creator_earnings_summary")
          .select("*")
          .eq("creator_id", profileId)
          .maybeSingle(),
        (supabase as any)
          .from("transaction_split_logs")
          .select("transaction_id,payment_external_id,created_at,flow_type,gross_amount,tax_amount,platform_amount,affiliate_amount,creator_amount,affiliate_id,provider")
          .eq("creator_id", profileId)
          .order("created_at", { ascending: false })
          .limit(200),
        (supabase as any)
          .from("pending_balance_releases")
          .select("id,amount,release_at,status,source_transaction_id,source_type,created_at")
          .eq("profile_id", profileId)
          .order("release_at", { ascending: true }),
        (supabase as any)
          .from("withdrawal_requests")
          .select("*")
          .eq("user_id", profileId)
          .order("created_at", { ascending: false })
          .limit(100),
        (supabase as any)
          .from("priority_message_transactions")
          .select("id,amount,net_amount,platform_fee,status,created_at,sender_profile_id,receiver_profile_id")
          .eq("receiver_profile_id", profileId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const summary = (summaryRes.data || null) as any;
      const splitLogs = ((splitLogsRes.data as any[]) || []).filter(Boolean);
      const pendingReleases = ((pendingRes.data as any[]) || []).filter(Boolean);
      const withdrawals = ((withdrawalsRes.data as any[]) || []).filter(Boolean);
      const chatTransactions = ((chatRes.data as any[]) || []).filter(Boolean);

      const transactionIds = [...new Set(splitLogs.map((row) => row.transaction_id).filter(Boolean))];
      const affiliateIds = [...new Set(splitLogs.map((row) => row.affiliate_id).filter(Boolean))];
      const chatSenderIds = [...new Set(chatTransactions.map((row) => row.sender_profile_id).filter(Boolean))];

      const { data: sourceTransactions } = transactionIds.length
        ? await (supabase as any)
            .from("transactions")
            .select("id,external_id,created_at,type,status,description,provider,user_id,post_id")
            .in("id", transactionIds)
        : { data: [] };

      const buyerIds = [...new Set((((sourceTransactions as any[]) || []).map((row) => row.user_id).filter(Boolean)))];
      const postIds = [...new Set((((sourceTransactions as any[]) || []).map((row) => row.post_id).filter(Boolean)))];
      const profileIdsToLoad = [...new Set([...buyerIds, ...affiliateIds, ...chatSenderIds])];

      const [{ data: relatedProfiles }, { data: posts }] = await Promise.all([
        profileIdsToLoad.length
          ? supabase.from("profiles").select("id, name, username").in("id", profileIdsToLoad)
          : Promise.resolve({ data: [] as any[] }),
        postIds.length
          ? supabase.from("posts").select("id, content_text").in("id", postIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const transactionMap = new Map((((sourceTransactions as any[]) || []).map((row) => [row.id, row])));
      const profileMap = new Map((((relatedProfiles as any[]) || []).map((row) => [row.id, row])));
      const postMap = new Map((((posts as any[]) || []).map((row) => [row.id, row])));

      const releaseMap = new Map<string, any>();
      pendingReleases.forEach((release) => {
        if (release.source_transaction_id && !releaseMap.has(release.source_transaction_id)) {
          releaseMap.set(release.source_transaction_id, release);
        }
      });

      const salesLedger: CreatorLedgerEntry[] = splitLogs.map((row) => {
        const sourceTx = transactionMap.get(row.transaction_id);
        const buyer = sourceTx?.user_id ? profileMap.get(sourceTx.user_id) : null;
        const affiliate = row.affiliate_id ? profileMap.get(row.affiliate_id) : null;
        const post = sourceTx?.post_id ? postMap.get(sourceTx.post_id) : null;
        const release = releaseMap.get(row.transaction_id);
        const entryType = resolveEntryType(sourceTx?.type);

        return {
          id: row.transaction_id,
          created_at: sourceTx?.created_at || row.created_at,
          type: entryType,
          status: releaseToStatus(release?.status, sourceTx?.status),
          related_title:
            entryType === "subscription"
              ? sourceTx?.description || "Assinatura"
              : post?.content_text || sourceTx?.description || "Conteúdo pago",
          buyer_name: buyer?.name || buyer?.username || null,
          gross_amount: money(row.gross_amount),
          tax_amount: money(row.tax_amount),
          platform_fee_amount: money(row.platform_amount),
          affiliate_amount: money(row.affiliate_amount),
          affiliate_name: affiliate?.name || affiliate?.username || null,
          creator_net_amount: money(row.creator_amount),
          provider: sourceTx?.provider || row.provider || null,
        };
      });

      const chatLedger: CreatorLedgerEntry[] = chatTransactions.map((row) => {
        const sender = profileMap.get(row.sender_profile_id);
        return {
          id: row.id,
          created_at: row.created_at,
          type: "chat",
          status: String(row.status || "paid").toLowerCase(),
          related_title: "Chat monetizado",
          buyer_name: sender?.name || sender?.username || null,
          gross_amount: money(row.amount),
          tax_amount: 0,
          platform_fee_amount: money(row.platform_fee),
          affiliate_amount: 0,
          affiliate_name: null,
          creator_net_amount: money(row.net_amount),
          provider: "chat",
        };
      });

      const withdrawalLedger: CreatorLedgerEntry[] = withdrawals.map((row) => ({
        id: row.id,
        created_at: row.created_at,
        type: "withdrawal",
        status: String(row.status || "pending").toLowerCase(),
        related_title: `Saque PIX ${String(row.pix_key_type || "").toUpperCase()}`.trim(),
        buyer_name: null,
        gross_amount: money(row.amount),
        tax_amount: 0,
        platform_fee_amount: money(row.platform_fee),
        affiliate_amount: 0,
        affiliate_name: null,
        creator_net_amount: money(row.net_amount),
        provider: "pix",
      }));

      const ledger = [...salesLedger, ...chatLedger, ...withdrawalLedger].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      const contentMetricMap = new Map<string, CreatorContentMetric>();
      salesLedger
        .filter((entry) => entry.type === "content")
        .forEach((entry) => {
          const key = transactionMap.get(entry.id)?.post_id || `content:${entry.related_title}`;
          const current = contentMetricMap.get(key) || {
            post_id: transactionMap.get(entry.id)?.post_id || null,
            title: entry.related_title,
            sales_count: 0,
            gross_amount: 0,
            net_amount: 0,
          };
          current.sales_count += 1;
          current.gross_amount += entry.gross_amount;
          current.net_amount += entry.creator_net_amount;
          contentMetricMap.set(key, current);
        });

      const contentMetrics = Array.from(contentMetricMap.values()).sort((a, b) => b.gross_amount - a.gross_amount);
      const chatGross = chatLedger.reduce((sum, entry) => sum + entry.gross_amount, 0);
      const chatNet = chatLedger.reduce((sum, entry) => sum + entry.creator_net_amount, 0);
      const nextRelease = pendingReleases.find((release) =>
        ["pending", "scheduled", "locked"].includes(String(release.status || "").toLowerCase()),
      );

      const grossTotal = money(summary?.total_bruto) + chatGross;
      const netTotal = money(summary?.total_liquido) + chatNet;
      const totalSales = (money(summary?.total_vendas) || salesLedger.length) + chatLedger.length;

      return {
        profile_id: profileId,
        creator_name: String(summary?.creator_name || profile.name || profile.username || "Criador"),
        username: (summary?.username || profile.username || null) as string | null,
        plan_type: (profile.plan_type || null) as string | null,
        pix_key: (profile.pix_key || null) as string | null,
        pix_key_type: (profile.pix_key_type || null) as string | null,
        account_status: (profile.account_status || null) as string | null,
        is_verified: Boolean(profile.is_verified),
        available_balance: money(summary?.balance),
        pending_balance: money(summary?.total_pendente),
        withdrawn_total: money(summary?.total_sacado),
        gross_total: grossTotal,
        net_total: netTotal,
        tax_total: money(summary?.total_imposto),
        platform_fee_total: money(summary?.total_taxa_plataforma),
        affiliate_total: money(summary?.total_taxa_afiliado),
        chat_total: chatGross,
        content_total: salesLedger.filter((entry) => entry.type === "content").reduce((sum, entry) => sum + entry.gross_amount, 0),
        subscriptions_total: salesLedger.filter((entry) => entry.type === "subscription").reduce((sum, entry) => sum + entry.gross_amount, 0),
        total_sales: totalSales,
        average_ticket: totalSales > 0 ? grossTotal / totalSales : 0,
        next_release_at: nextRelease?.release_at || null,
        pending_withdrawals: withdrawals.filter((row) => String(row.status || "").toLowerCase() === "pending").length,
        ledger,
        content_metrics: contentMetrics,
        withdrawals,
        pending_releases: pendingReleases,
      };
    },
  });
}