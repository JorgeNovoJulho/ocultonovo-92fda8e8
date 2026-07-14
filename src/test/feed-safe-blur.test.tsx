import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdultMediaBlurOverlay } from '@/components/feed/AdultMediaBlurOverlay';
import { useViewStore } from '@/store/useViewStore';

const blurMock = vi.hoisted(() => ({
  safeBlurOn: true,
  revealed: new Set<string>(),
  revealPost: vi.fn((id: string) => blurMock.revealed.add(id)),
}));

vi.mock('@/safe-blur/SafeBlurProvider', () => ({
  useSafeBlur: () => ({
    safeBlurOn: blurMock.safeBlurOn,
    isRevealed: (id: string) => blurMock.revealed.has(id),
    revealPost: blurMock.revealPost,
    toggleSafeBlur: vi.fn(),
    setSafeBlurOn: vi.fn(),
    hideAllAgain: vi.fn(),
  }),
}));

function renderPostMedia(post: { id: string; is_adult?: boolean | null; post_type?: string }) {
  const active = post.is_adult === true && post.post_type !== 'poll';
  return render(
    <AdultMediaBlurOverlay postId={post.id} active={active}>
      <img alt="mídia do post" src="/mock.jpg" />
    </AdultMediaBlurOverlay>,
  );
}

describe('feed safe blur UI', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    blurMock.safeBlurOn = true;
    blurMock.revealed = new Set();
    blurMock.revealPost.mockClear();
    useViewStore.setState({ feedSafeBlurOn: true, revealedAdultPostIds: [] });
  });

  it('não aplica overlay quando is_adult é false, null ou undefined', () => {
    renderPostMedia({ id: 'safe-false', is_adult: false });
    renderPostMedia({ id: 'safe-null', is_adult: null });
    renderPostMedia({ id: 'safe-undefined' });

    expect(screen.queryByRole('button', { name: /mostrar conteúdo adulto/i })).not.toBeInTheDocument();
    expect(screen.getAllByAltText('mídia do post')).toHaveLength(3);
  });

  it('ignora enquetes mesmo quando is_adult=true', () => {
    renderPostMedia({ id: 'poll-adult', is_adult: true, post_type: 'poll' });
    expect(screen.queryByRole('button', { name: /mostrar conteúdo adulto/i })).not.toBeInTheDocument();
  });

  it('mostra só um botão individual e revela o post sem re-overlay duplicado', () => {
    const { rerender } = render(
      <AdultMediaBlurOverlay postId="adult-1" active>
        <img alt="mídia do post" src="/mock.jpg" />
      </AdultMediaBlurOverlay>,
    );

    expect(screen.getAllByText('Mostrar')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /mostrar conteúdo adulto/i }));
    expect(blurMock.revealPost).toHaveBeenCalledWith('adult-1');

    rerender(
      <AdultMediaBlurOverlay postId="adult-1" active>
        <img alt="mídia do post" src="/mock.jpg" />
      </AdultMediaBlurOverlay>,
    );

    expect(screen.queryByText('Mostrar')).not.toBeInTheDocument();
  });

  it('Zustand persiste o blur global e limpa posts revelados ao religar', () => {
    useViewStore.getState().setFeedSafeBlurOn(false);
    expect(useViewStore.getState().feedSafeBlurOn).toBe(false);

    useViewStore.getState().revealAdultPost('adult-opened');
    expect(useViewStore.getState().isAdultPostRevealed('adult-opened')).toBe(true);

    useViewStore.getState().setFeedSafeBlurOn(true);
    expect(useViewStore.getState().feedSafeBlurOn).toBe(true);
    expect(useViewStore.getState().isAdultPostRevealed('adult-opened')).toBe(false);
  });
});