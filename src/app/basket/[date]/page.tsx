import { MatchCenter } from "@/components/MatchCenter";

export default async function BasketDatePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return <MatchCenter date={date} />;
}
