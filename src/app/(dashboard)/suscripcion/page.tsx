import { redirect } from "next/navigation";

export default function SuscripcionRedirectPage() {
  redirect("/dashboard/billing");
}
