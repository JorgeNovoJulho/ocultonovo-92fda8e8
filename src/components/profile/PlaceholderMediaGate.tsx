import PlaceholderMediaModal from "./PlaceholderMediaModal";
import { usePlaceholderMediaCheck } from "@/hooks/usePlaceholderMediaCheck";

/**
 * Wrapper para encapsular hook + modal — montado lazy no DashboardLayout.
 */
export default function PlaceholderMediaGate() {
  const { open, close, needsAvatar, needsCover } = usePlaceholderMediaCheck();
  if (!open) return null;
  return (
    <PlaceholderMediaModal
      open={open}
      onClose={close}
      needsAvatar={needsAvatar}
      needsCover={needsCover}
    />
  );
}
