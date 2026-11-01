import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SummaryDashboard from "@/components/SummaryDashboard";

export default async function SummaryPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <SummaryDashboard userId={user.id} />;
}
