import { useCallback, useEffect, useState } from "react";
import { supabase as supabaseExternal } from "@/lib/supabaseExternal";
import { AdDoc } from "../layerTypes";

export interface UserAdTemplate {
  id: string;
  owner_id: string;
  name: string;
  thumbnail: string | null;
  doc: AdDoc;
  width: number;
  height: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

const TABLE = "oculto_ad_templates";

export function useUserAdTemplates() {
  const [templates, setTemplates] = useState<UserAdTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabaseExternal.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      setTemplates([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabaseExternal
      .from(TABLE)
      .select("*")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false })
      .limit(60);
    setLoading(false);
    if (error) {
      console.error("[useUserAdTemplates] list", error);
      return;
    }
    setTemplates((data as UserAdTemplate[]) ?? []);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    async (name: string, doc: AdDoc, thumbnail: string | null) => {
      if (!userId) throw new Error("Faça login para salvar templates.");
      const payload = {
        owner_id: userId,
        name: name.trim() || "Sem título",
        doc,
        thumbnail,
        width: doc.width,
        height: doc.height,
        is_public: false,
      };
      const { data, error } = await supabaseExternal
        .from(TABLE)
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      await refresh();
      return data as UserAdTemplate;
    },
    [userId, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabaseExternal.from(TABLE).delete().eq("id", id);
      if (error) throw error;
      setTemplates((t) => t.filter((x) => x.id !== id));
    },
    [],
  );

  return { templates, loading, userId, save, remove, refresh };
}
