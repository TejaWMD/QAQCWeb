import React, { useEffect } from "react";
import LabelPreview from "@/components/labels/LabelPreview";
import { printCss } from "@/lib/labels";

// Mounted only while a print job is running. The sheet sits off-screen on the
// monitor and becomes the only visible thing on the printed page: one label per
// page, at the exact template or layout size with no margins.
export default function LabelPrintSheet({ job, onDone }) {
  const hasPageImage = Boolean(job?.pageImageUrl);
  const layout = hasPageImage
    ? { width_mm: job.pageWidthMm || 150, height_mm: job.pageHeightMm || 100 }
    : job?.layout;
  const copies = Math.max(1, Math.round(job?.copies || 1));

  useEffect(() => {
    if (!job || !layout) return undefined;
    let cancelled = false;
    const handleAfterPrint = () => {
      if (!cancelled) onDone?.();
    };
    window.addEventListener("afterprint", handleAfterPrint);
    const images = Array.from(document.querySelectorAll("#label-print-root img"));
    const loaded = Promise.all(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            })
      )
    );
    const fallback = new Promise((resolve) => setTimeout(resolve, 3000));
    Promise.race([loaded, fallback]).then(() => {
      if (cancelled) return;
      setTimeout(() => {
        if (!cancelled) window.print();
      }, 150);
    });
    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [job, layout, onDone]);

  if (!job || !layout) return null;

  return (
    <>
      <style>{printCss(layout)}</style>
      <div id="label-print-root" style={{ position: "fixed", left: "-10000px", top: 0 }}>
        {Array.from({ length: copies }).map((_, index) => (
          <div
            key={index}
            className="label-page"
            style={{
              width: `${layout.width_mm}mm`,
              height: `${layout.height_mm}mm`,
              overflow: "hidden",
              background: "#ffffff",
            }}
          >
            {hasPageImage ? (
              <img
                src={job.pageImageUrl}
                alt={`Label page ${index + 1}`}
                style={{
                  display: "block",
                  width: `${layout.width_mm}mm`,
                  height: `${layout.height_mm}mm`,
                  objectFit: "fill",
                }}
              />
            ) : (
              <LabelPreview layout={layout} data={job.data} />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
