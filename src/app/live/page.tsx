import { MatchCenter } from "@/components/MatchCenter";
import { todayIso } from "@/lib/api";

export default function LivePage() {
  return <MatchCenter date={todayIso()} />;
}
