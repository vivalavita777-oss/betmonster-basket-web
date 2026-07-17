import { redirect } from "next/navigation";
import { appTodayIso } from "@/lib/time";

export default function HomePage() {
  redirect(`/basket/${appTodayIso()}`);
}
