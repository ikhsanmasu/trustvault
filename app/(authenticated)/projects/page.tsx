import { redirect } from "next/navigation";

/** Projects list merged into My Vault. Redirect. */
export default function ProjectsPage() {
  redirect("/vault");
}
