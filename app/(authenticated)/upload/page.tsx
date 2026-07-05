import { redirect } from "next/navigation";

/** Upload page merged into the Vault (upload modal). Redirect. */
export default function UploadPage() {
  redirect("/vault?upload=1");
}
