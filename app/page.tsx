import { AppGate } from "@/components/app-gate";
import { LocalAppGate } from "@/components/local-app-gate";
import { SelfHostedAppGate } from "@/components/self-hosted-app-gate";

export default function Home() {
  if (process.env.NEXT_PUBLIC_APP_MODE === "local") return <LocalAppGate />;
  if (process.env.NEXT_PUBLIC_APP_MODE === "self-hosted") return <SelfHostedAppGate />;
  return <AppGate />;
}
