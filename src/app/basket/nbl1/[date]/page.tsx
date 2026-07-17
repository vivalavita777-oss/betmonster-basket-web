import { MatchCenter } from "@/components/MatchCenter";

export default async function Nbl1DatePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return <MatchCenter date={date} league="NBL1" />;
}
