/**
 * English language pack — lazy-loaded on demand.
 * Keys missing here automatically fall back to PT-BR via t().
 */
const dict: Record<string, string> = {
  // Selector
  "language.label": "Language",
  "language.pt": "Portuguese",
  "language.en": "English",
  "language.es": "Spanish",
  "language.download": "Download {lang} pack",
  "language.downloading": "Downloading {lang} pack…",
  "language.downloaded": "{lang} pack ready",
  "language.downloadFailed": "Failed to download pack",
  "language.installed": "Installed",
  "language.available": "Tap to download",
  "language.error": "Download failed — tap to retry",
  "language.changedTo": "Language changed to {lang}",

  // Suggestions widget
  "suggestions.title": "Explore new mysterious ones",
  "suggestions.viewAll": "Explore new mysterious ones",
  "suggestions.dismiss": "Dismiss suggestion",
  "suggestions.prev": "Previous",
  "suggestions.next": "Next",
  "suggestions.viewProfile": "View {name}'s profile",
  "suggestions.mutual": "{count} mutual following",
  "suggestions.affinity": "{count} affinities",
  "suggestions.newProfile": "New profile",
  "suggestions.follow": "Add",
  "suggestions.following": "Following",
  "suggestions.adminDescription":
    'Configure the "Explore new mysterious ones" section and the golden highlight price.',

  // Feed chrome
  "feed.tabs.following": "Following",
  "feed.tabs.foryou": "Feed Highlights",
  "feed.tabs.vip": "My VIP Content",
  "feed.tabs.card": "Card Mode",
  "feed.empty.posts": "No posts yet",
  "feed.empty.following": "No posts from people you follow",

  // Stories
  "stories.your": "Your Story",
  "stories.empty": "No stories available",
  "stories.user.fallback": "User",

  // Header
  "header.beta": "BETA",
  "header.search": "Search",
  "header.notifications": "Notifications",
  "header.theme": "Theme",

  // Bottom nav
  "nav.home": "Home",
  "nav.radar": "Radar",
  "nav.aura": "Aura",
  "nav.alerts": "Alerts",
  "nav.chat": "Chat",
  "nav.you": "You",
  "nav.menu": "Menu",
  "nav.explore": "Explore",
  "nav.messages": "Messages",

  // Global actions
  "action.follow": "Follow",
  "action.following": "Following",
  "action.unfollow": "Unfollow",
  "action.like": "Like",
  "action.liked": "Liked",
  "action.comment": "Comment",
  "action.share": "Share",
  "action.save": "Save",
  "action.saved": "Saved",
  "action.send": "Send",
  "action.cancel": "Cancel",
  "action.confirm": "Confirm",
  "action.close": "Close",
  "action.delete": "Delete",
  "action.edit": "Edit",
  "action.loading": "Loading…",
  "action.retry": "Try again",

  // Common toasts
  "toast.copied": "Copied to clipboard",
  "toast.saved": "Saved successfully",
  "toast.error.generic": "Something went wrong. Please try again.",
  "toast.error.network": "No connection. Check your internet.",
  "toast.success.generic": "All done!",
};

export default dict;
