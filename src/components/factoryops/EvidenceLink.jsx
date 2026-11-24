import React from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Paperclip } from "lucide-react";

// Inline link to an attached evidence file: signs the private file on demand and
// opens it in a new tab. uri is the private file_uri stored on the record.
export default function EvidenceLink({ uri, name }) {
  if (!uri) return <span className="text-sm text-[#64748B]">—</span>;
  const view = async () => {
    const popup = window.open("", "_blank");
    try {
      if (uri.startsWith("data:")) {
        const res = await fetch(uri);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        if (popup) popup.location.href = blobUrl;
        else window.open(blobUrl, "_blank");
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        return;
      }
      const res = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri });
      if (popup) popup.location.href = res.signed_url;
      else window.open(res.signed_url, "_blank");
    } catch {
      if (popup) popup.close();
      toast.error("Could not open the attachment. Please try again.");
    }
  };
  return (
    <button
      type="button"
      onClick={view}
      className="text-[#1D4ED8] hover:underline text-xs inline-flex items-center gap-1 max-w-[160px] truncate"
      title={name || "View evidence"}
    >
      <Paperclip className="w-3 h-3 shrink-0" />
      {name || "View"}
    </button>
  );
}