import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

export interface SearchResult {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  other_user_id: string;
  other_user_name: string;
  other_user_avatar: string;
}

export function useMessageSearch() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    setQuery(q);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!q.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      if (!user) { setSearching(false); return; }

      try {
        const { data, error } = await supabase.rpc('search_my_messages', {
          p_user_id: user.id,
          p_query: q.trim(),
          p_limit: 20,
        });

        if (error) {
          console.error('[Search] RPC error:', error);
          setResults([]);
        } else {
          setResults((data as SearchResult[]) || []);
        }
      } catch (err) {
        console.error('[Search] Exception:', err);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [user]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setSearching(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const isActive = query.trim().length > 0;

  return { query, results, searching, search, clearSearch, isActive };
}
