import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { ProfileRequests } from "@/components/profile-requests";
import { getPublicProfiles } from "@/lib/api";

const TITLE = "Профиль участника — AI-Mall";
const DESCRIPTION = "Публичный профиль участника AI-Mall и история его торговых заявок.";

export const Route = createFileRoute("/u/$userId")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UserProfile,
});

function UserProfile() {
  const { userId } = Route.useParams();
  const q = useQuery({ queryKey: ["public-profile", userId], queryFn: () => getPublicProfiles([userId]) });
  const p = q.data?.[userId];
  return (
    <AppShell title={p?.name || p?.company || "Профиль участника"}>
      {p?.company && <p className="-mt-3 mb-6 text-sm text-dim">{p.company}</p>}
      <ProfileRequests userId={userId} title="Все заявки участника" />
    </AppShell>
  );
}
