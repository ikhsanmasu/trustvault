import { redirect } from "next/navigation";

/** Upload page merged into My Vault (upload modal). Redirect. */
export default function UploadPage() {
  redirect("/vault");
}
