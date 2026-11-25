import React from "react";
import { barcodeImageUrl, batchQrPayload, fmtDay, qrImageUrl } from "@/lib/labels";

// Shared 60x40mm label card rendered at 380px width for both PDF export and
// locked-template printing so Batch Records and Create Batch match identically.
export default function LockedLabelCard({ id, data, qrEcc = "M", className = "" }) {
  if (!data) return null;
  const barcodeVal = data.cartonBarcode || data.batchNumber;

  return (
    <div
      id={id}
      data-logo-badge="true"
      style={{ backgroundColor: "#ffffff", color: "#0f172a" }}
      className={`rounded-xl border border-slate-200 p-5 shadow-md w-[380px] space-y-3 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 text-xs" style={{ color: "#0f172a" }}>
          <p className="font-bold text-sm leading-tight uppercase" style={{ color: "#0f172a" }}>
            {data.cartonDescription || data.productName}
          </p>
          <p className="font-semibold" style={{ color: "#1e293b" }}>
            {data.productCode}
          </p>
          <p className="font-bold" style={{ color: "#0f172a" }}>
            {data.batchNumber}
          </p>
          <p style={{ color: "#475569" }}>Exp: {fmtDay(data.expiryDate)}</p>
          <p style={{ color: "#475569" }}>{data.pcsPerCarton || 24} pcs/carton</p>
        </div>
        <img
          src={qrImageUrl(batchQrPayload(data), qrEcc)}
          alt="QR"
          crossOrigin="anonymous"
          className="w-24 h-24 shrink-0"
        />
      </div>
      <div className="pt-2 text-center">
        <img
          src={barcodeImageUrl(barcodeVal)}
          alt="Barcode"
          crossOrigin="anonymous"
          className="w-full h-11 object-contain"
        />
        <p className="text-[11px] font-mono tracking-wider mt-0.5" style={{ color: "#334155" }}>
          {barcodeVal}
        </p>
      </div>
    </div>
  );
}
