import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Paperclip, Upload } from "lucide-react";

// Evidence attachment control: uploads a file privately and shows the uploaded
// file so it can be attached to a record. value: { uri, name }.
export default function EvidenceUpload({ value = {}, onChange, label = "Evidence Attachment" }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const res = await base44.integrations.Core.UploadPrivateFile({ file });
      onChange({ uri: res.file_uri, name: file.name });
    } catch (e) {
      setError(e?.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      {label && <span className="text-xs text-[#64748B]">{label}</span>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf,application/pdf,.doc,.docx,.xls,.xlsx,.csv"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {!value.uri && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="bg-white border-[#E2E8F0] text-[#334155] hover:bg-[#F1F5F9] hover:text-[#0F294A] w-full justify-start"
        >
          {uploading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-[#E2E8F0] border-t-[#0F294A] rounded-full animate-spin" /> Uploading...
            </>
          ) : (
            <>
              <Upload className="w-3.5 h-3.5 mr-1" /> Attach evidence file
            </>
          )}
        </Button>
      )}
      {value.uri && (
        <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-md px-2.5 py-1.5">
          <Paperclip className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          <span className="text-xs text-[#334155] truncate flex-1">{value.name || "Evidence file"}</span>
          <button type="button" className="text-[10px] text-rose-600 hover:underline" onClick={() => onChange({ uri: "", name: "" })}>
            Remove
          </button>
        </div>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}