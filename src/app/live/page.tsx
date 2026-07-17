import { MatchCenter } from "@/components/MatchCenter";
import { appTodayIso } from "@/lib/time";

export default function LivePage() {
  return <MatchCenter date={appTodayIso()} />;
}
