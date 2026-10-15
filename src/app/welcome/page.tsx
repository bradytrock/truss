import { Suspense } from "react";
import { InviteWelcome } from "@/components/invite-welcome";

export default function WelcomePage() {
  return (
    <Suspense>
      <InviteWelcome />
    </Suspense>
  );
}
