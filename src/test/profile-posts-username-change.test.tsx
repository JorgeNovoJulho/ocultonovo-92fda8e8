import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCreatorPosts } from "@/hooks/useCreatorProfile";

const { getResolvedAuthorScopeMock, supabaseMock } = vi.hoisted(() => ({
  getResolvedAuthorScopeMock: vi.fn(),
  supabaseMock: {
    from: vi.fn(),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@/lib/postAuthorResolver", () => ({
  getResolvedAuthorScope: (...args: any[]) => getResolvedAuthorScopeMock(...args),
}));

vi.mock("@/lib/supabaseExternal", () => ({
  supabase: supabaseMock,
}));

function createQueryBuilder(table: string) {
  const state: Record<string, any> = { table, eq: null, or: null, in: null };

  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: string) => {
      state.eq = { column, value };
      return builder;
    }),
    or: vi.fn((value: string) => {
      state.or = value;
      return builder;
    }),
    in: vi.fn((column: string, value: string[]) => {
      state.in = { column, value };
      return builder;
    }),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => {
      if (table === "profiles" && state.eq?.column === "username" && state.eq?.value === "mulatacuriosa_ofc") {
        return {
          data: { id: "profile-current", user_id: "auth-user-1", username: "mulatacuriosa_ofc" },
          error: null,
        };
      }

      return { data: null, error: null };
    }),
    then: (resolve: (value: any) => any) => {
      if (table === "posts") {
        if (state.or?.includes("creator_id.eq.auth-user-1")) {
          return Promise.resolve(resolve({ data: [], error: null }));
        }

        if (state.or?.includes("user_id.eq.profile-current") || state.or?.includes("user_id.eq.profile-legacy")) {
          return Promise.resolve(resolve({ data: [], error: null }));
        }

        if (state.or?.includes("author_id.eq.profile-current") || state.or?.includes("author_id.eq.profile-legacy")) {
          return Promise.resolve(resolve({
            data: [
              {
                id: "post-1",
                author_id: "profile-legacy",
                content_text: "post legado",
                created_at: "2026-05-25T10:00:00Z",
                post_type: "feed",
                is_flash: false,
                is_hidden: false,
              },
            ],
            error: null,
          }));
        }
      }

      if (table === "saved_posts" || table === "post_likes" || table === "post_dislikes") {
        return Promise.resolve(resolve({ data: [], error: null }));
      }

      return Promise.resolve(resolve({ data: [], error: null }));
    },
  };

  return builder;
}

describe("posts do perfil após troca de username", () => {
  beforeEach(() => {
    supabaseMock.from.mockImplementation((table: string) => createQueryBuilder(table));
    getResolvedAuthorScopeMock.mockReset();
    getResolvedAuthorScopeMock.mockResolvedValue({
      authorProfileId: "profile-current",
      creatorId: "auth-user-1",
      allProfileIds: ["profile-current", "profile-legacy"],
      matchedUsernames: ["mulatacuriosa_ofc", "bionca"],
      canonicalUsername: "mulatacuriosa_ofc",
      hasLegacyProfiles: true,
    });
  });

  it("retorna posts mesmo quando eles ainda estão vinculados ao profile legado", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: any }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreatorPosts("mulatacuriosa_ofc"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]?.id).toBe("post-1");
    expect(getResolvedAuthorScopeMock).toHaveBeenCalledWith("auth-user-1", {
      usernames: ["mulatacuriosa_ofc"],
    });
  });
});