const normalizeToken = (value?: string | null) => {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

type BuildChannelRouteInput = {
  ownerId?: string | null;
  ownerUserId?: string | null;
  ownerUsername?: string | null;
  ownerName?: string | null;
  channelId?: string | null;
  channelTitle?: string | null;
};

export const buildChannelRoute = ({
  ownerId,
  ownerUserId,
  ownerUsername,
  ownerName,
  channelId,
  channelTitle,
}: BuildChannelRouteInput) => {
  const ownerRef = ownerUsername || ownerUserId || ownerId || normalizeToken(ownerName);
  const params = new URLSearchParams();

  if (channelId) params.set("plan", channelId);
  const normalizedChannel = normalizeToken(channelTitle);
  if (normalizedChannel) params.set("channel", normalizedChannel);

  const query = params.toString();
  return `/canal/${encodeURIComponent(ownerRef || "")}${query ? `?${query}` : ""}`;
};

export const normalizeChannelToken = normalizeToken;