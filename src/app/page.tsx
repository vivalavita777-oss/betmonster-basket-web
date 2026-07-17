import { redirect } from "next/navigation";
import { todayIso } from "@/lib/api";

export default function HomePage() {
  redirect(`/basket/${todayIso()}`);
}
