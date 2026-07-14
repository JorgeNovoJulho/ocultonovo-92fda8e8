import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NotificationBell } from "@/components/NotificationBell";
import NotificationsPage from "@/pages/NotificationsPage";
import { notificationActorProfilesFixture, notificationFixtures } from "@/test/notificationFixtures";

const navigateMock = vi.fn();

vi.mock("@/components/SupportTicketModal", () => ({
  SupportTicketModal: () => null,
}));

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    notifications: notificationFixtures,
    loading: false,
    loadingMore: false,
    hasMore: false,
    unreadCount: 3,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    clearAllNotifications: vi.fn(),
    loadMore: vi.fn(),
  }),
}));

vi.mock("@/hooks/useActorProfiles", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useActorProfiles")>("@/hooks/useActorProfiles");
  return {
    ...actual,
    useActorProfiles: () => notificationActorProfilesFixture,
  };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

beforeEach(() => {
  navigateMock.mockReset();
  class IntersectionObserverMock {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  vi.stubGlobal("IntersectionObserver", IntersectionObserverMock as unknown as typeof IntersectionObserver);
});

describe("renderização de avatares nas notificações", () => {
  it("mostra foto e fallback no sino com actor_id em formatos diferentes", async () => {
    const view = render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );

    fireEvent.click(view.getByRole("button", { name: /notificações/i }));

    await waitFor(() => {
      expect(view.container.ownerDocument.querySelectorAll("img").length).toBeGreaterThan(0);
    });

    const images = Array.from(view.container.ownerDocument.querySelectorAll("img"));
    expect(images.some((img) => img.getAttribute("src") === "https://cdn.example.com/avatar-direct.jpg")).toBe(true);
    expect(images.some((img) => img.getAttribute("src") === "https://cdn.example.com/avatar-sender.jpg")).toBe(true);
    expect(view.getByText("D")).toBeInTheDocument();
  });

  it("mostra foto do perfil e fallback por iniciais na lista de notificações", () => {
    const view = render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );

    const images = view.getAllByRole("img");
    expect(images.some((img) => img.getAttribute("src") === "https://cdn.example.com/avatar-direct.jpg")).toBe(true);
    expect(images.some((img) => img.getAttribute("src") === "https://cdn.example.com/avatar-sender.jpg")).toBe(true);
    expect(view.getByText("D")).toBeInTheDocument();
  });
});