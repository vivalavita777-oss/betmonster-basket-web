import { MatchCenter } from "@/components/MatchCenter";

export default async function WnbaDatePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return <MatchCenter date={date} league="WNBA" />;
}
