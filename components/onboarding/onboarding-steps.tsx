import {
  IconUpload,
  IconFolder,
  IconSearch,
  IconShare,
  IconSparkle,
  IconBrand,
} from "@/components/icons";

export interface OnboardingStep {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  illustration: string; // emoji for illustration
  tips: string[];
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: "Welcome to InTrustVault",
    description:
      "The document integrity platform that tells you when a change actually matters — with cryptographic proof behind every verdict.",
    icon: IconBrand,
    illustration: "🛡️",
    tips: [
      "Upload any of 14 file formats (PDF, DOCX, XLSX, and more)",
      "Compare versions with AI-powered materiality detection",
      "Anchor fingerprints on-chain for tamper-proof verification",
      "Share documents securely with custom permissions",
    ],
  },
  {
    title: "Upload Your First Document",
    description:
      "Start by uploading a document to your vault. We support PDFs, Word documents, Excel sheets, text files, and 10 other formats.",
    icon: IconUpload,
    illustration: "📄",
    tips: [
      "Drag & drop files or click the Upload button",
      "Files up to 50 MB each (100 MB on Pro)",
      "Documents are encrypted in transit and at rest",
      "Each upload automatically generates integrity hashes",
    ],
  },
  {
    title: "Your Document Vault",
    description:
      "All your documents live in the Vault. Search, filter, sort, and organize with labels — your documents, your way.",
    icon: IconFolder,
    illustration: "🗄️",
    tips: [
      "Switch between grid and table views",
      "Filter by file type or search by name",
      "Use labels to organize documents by category",
      "Soft-delete preserves integrity proofs for audit",
    ],
  },
  {
    title: "Compare & Detect Changes",
    description:
      "Upload a new version and compare it against the original. We check binary hashes first, then text hashes — only if both differ do we ask AI to judge whether the change is material.",
    icon: IconSearch,
    illustration: "🔍",
    tips: [
      "Binary hash → Text hash → AI analysis pipeline",
      "AI distinguishes material changes from cosmetic ones",
      "Get a confidence score and reasoning with every verdict",
      "Ephemeral compare: uploaded file is never stored",
    ],
  },
  {
    title: "Share Securely",
    description:
      "Create share links with granular permissions. Allow viewing, downloading, AI chat over shared documents, or on-chain verification.",
    icon: IconShare,
    illustration: "🔗",
    tips: [
      "Control download, chat, anchor, and compare access",
      "Share links can be revoked anytime",
      "Recipients can chat with your documents via AI",
      "Perfect for audits, legal reviews, and compliance",
    ],
  },
  {
    title: "You're All Set!",
    description:
      "Your vault is ready. Start uploading documents and experience the confidence of cryptographically-verified integrity.",
    icon: IconSparkle,
    illustration: "🚀",
    tips: [
      "Free plan: 10 docs, 50 AI verdicts/month",
      "Pro plan: unlimited docs, 500 verdicts, on-chain anchoring",
      "Need help? Check the assistant for AI-powered Q&A",
      "Your data is tenant-isolated and RLS-protected",
    ],
  },
];
