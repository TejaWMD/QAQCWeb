import { buildQrUrl, buildBarcodeUrl, formatDateDisplay, LABEL_LAYOUTS } from "./stockUtils";

// Render the label at 2.5x the 300 DPI baseline so the 100x150 template
// (which scales the label 250%) still resolves to a true 300 DPI in the PDF.
const RENDER_DPI = 750;
const PX_PER_MM = RENDER_DPI / 25.4;

export const LABEL_W_MM = 60;
export const LABEL_H_MM = 40;

function fetchDataUrl(url) {
  return fetch(url)
    .then((r) => r.blob())
    .then(
      (blob) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
    );
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function loadImgFromUrl(url) {
  const dataUrl = await fetchDataUrl(url);
  return loadImage(dataUrl);
}

// Loads an uploaded barcode image and trims its surrounding white margin so the
// bars fill the label's barcode area. Cached per URL.
const _barcodeCache = new Map();
function loadBarcodeImage(url) {
  if (!_barcodeCache.has(url)) {
    _barcodeCache.set(url, loadImgFromUrl(url).then(trimWhitespace));
  }
  return _barcodeCache.get(url);
}

function trimWhitespace(img) {
  // Find dark-pixel bounds on a downscaled copy, then crop the full-res image.
  const scale = Math.min(1, 600 / Math.max(img.width, img.height));
  const sw = Math.round(img.width * scale);
  const sh = Math.round(img.height * scale);
  const probe = document.createElement("canvas");
  probe.width = sw;
  probe.height = sh;
  const pctx = probe.getContext("2d");
  pctx.drawImage(img, 0, 0, sw, sh);
  const { data } = pctx.getImageData(0, 0, sw, sh);
  let minX = sw, minY = sh, maxX = -1, maxY = -1;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      if (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 < 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return img;
  const sx = minX / scale;
  const sy = minY / scale;
  const cw = (maxX - minX + 1) / scale;
  const ch = (maxY - minY + 1) / scale;
  const out = document.createElement("canvas");
  out.width = Math.round(cw);
  out.height = Math.round(ch);
  out.getContext("2d").drawImage(img, sx, sy, cw, ch, 0, 0, out.width, out.height);
  return out;
}

function wrapText(ctx, text, maxWidthPx) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidthPx && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Renders the 60 x 40 mm label design to a canvas at high resolution.
 * `layoutId` selects one of the layouts in LABEL_LAYOUTS (default/draftA/draftB/draftC).
 * Returns the canvas element (reused for both preview and PDF export).
 */
export async function renderLabelCanvas(batch, layout = "default") {
  const L =
    typeof layout === "object" && layout !== null
      ? layout
      : LABEL_LAYOUTS[layout] || LABEL_LAYOUTS.default;
  const labelH = L.labelH || LABEL_H_MM;
  const labelW = L.labelW || LABEL_W_MM;
  const W = Math.round(labelW * PX_PER_MM);
  const H = Math.round(labelH * PX_PER_MM);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const mm = (v) => v * PX_PER_MM;

  // QR code
  if (L.qr && batch.qr_payload) {
    const ecLevel = L.qr.ecLevel || "M";
    const qrImg = await loadImgFromUrl(buildQrUrl(batch.qr_payload, 600, ecLevel));
    ctx.drawImage(qrImg, mm(L.qr.x), mm(L.qr.y), mm(L.qr.size), mm(L.qr.size));
  }

  // Text column (positions/sizes driven by the layout config)
  const colXpx = mm(L.text.x);
  const colWpx = mm(L.text.w);
  const availableH = mm(L.text.maxH);

  const batchLine = batch.pcs_per_carton
    ? `${batch.batch_number}  ·  ${batch.pcs_per_carton} PCS/CARTON`
    : batch.batch_number;

  const fields = [
    { text: batch.product_name, bold: true, isName: true },
    { text: batch.item_code, bold: true },
    { text: batchLine, bold: true },
    { text: "Exp: " + formatDateDisplay(batch.expiry_date), bold: false },
  ].filter((f) => f.text);

  // Auto-scale: find a font size where everything fits the text area height
  let baseSizePt = 8;
  while (baseSizePt >= 5) {
    let totalH = 0;
    for (const f of fields) {
      const sz = f.isName ? baseSizePt : baseSizePt + (f.bold ? 1 : 0);
      const fontPx = sz * (RENDER_DPI / 72);
      ctx.font = `${f.bold ? "bold " : ""}${fontPx}px Inter, sans-serif`;
      const lines = wrapText(ctx, f.text, colWpx);
      totalH += fontPx * 1.2 * lines.length + 0.4 * PX_PER_MM;
    }
    if (totalH <= availableH) break;
    baseSizePt -= 0.5;
  }

  let y = mm(L.text.y);

  const drawProductName = (text, startSizePt, maxLines, gapMm = 0.4) => {
    if (!text) return;
    let sizePt = startSizePt;
    let lines = [];
    while (sizePt >= 5) {
      const fontPx = sizePt * (RENDER_DPI / 72);
      ctx.font = `bold ${fontPx}px Inter, sans-serif`;
      lines = wrapText(ctx, text, colWpx);
      if (lines.length <= maxLines) break;
      sizePt -= 0.5;
    }
    const fontPx = sizePt * (RENDER_DPI / 72);
    ctx.font = `bold ${fontPx}px Inter, sans-serif`;
    ctx.fillStyle = "#0f172a";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    const lineHpx = fontPx * 1.2;
    for (const line of lines) {
      ctx.fillText(line, colXpx, y);
      y += lineHpx;
    }
    y += gapMm * PX_PER_MM;
  };

  const drawText = (text, sizePt, bold, gapMm = 0.4) => {
    if (!text) return;
    const fontPx = sizePt * (RENDER_DPI / 72);
    ctx.font = `${bold ? "bold " : ""}${fontPx}px Inter, sans-serif`;
    ctx.fillStyle = "#0f172a";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    const lines = wrapText(ctx, text, colWpx);
    const lineHpx = fontPx * 1.2;
    for (const line of lines) {
      ctx.fillText(line, colXpx, y);
      y += lineHpx;
    }
    y += gapMm * PX_PER_MM;
  };

  const drawTextFit = (text, startSizePt, bold, gapMm = 0.4) => {
    if (!text) return;
    let sizePt = startSizePt;
    let fontPx = sizePt * (RENDER_DPI / 72);
    ctx.font = `${bold ? "bold " : ""}${fontPx}px Inter, sans-serif`;
    while (ctx.measureText(text).width > colWpx && sizePt > 4) {
      sizePt -= 0.5;
      fontPx = sizePt * (RENDER_DPI / 72);
      ctx.font = `${bold ? "bold " : ""}${fontPx}px Inter, sans-serif`;
    }
    ctx.fillStyle = "#0f172a";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(text, colXpx, y);
    y += fontPx * 1.2 + gapMm * PX_PER_MM;
  };

  drawProductName(batch.product_name, baseSizePt, L.text.nameLines || 4);
  drawTextFit(batch.item_code, Math.min(baseSizePt + 2, 10), true);
  drawText(batchLine, Math.min(baseSizePt + 1, 9), true);
  drawText("Exp: " + formatDateDisplay(batch.expiry_date), baseSizePt, false);

  // Barcode area. If the product has an uploaded carton barcode image, that image
  // replaces the whole barcode placement area (bars + digits row) — no barcode is
  // generated. Otherwise the barcode is generated from the carton_barcode value.
  if (L.barcode && batch.carton_barcode_image) {
    const barImg = await loadBarcodeImage(batch.carton_barcode_image);
    const ms = 1.5; // side margin (mm)
    ctx.drawImage(
      barImg,
      mm(L.barcode.x + ms),
      mm(L.barcode.y),
      mm(L.barcode.w - ms * 2),
      mm(labelH - 8 - L.barcode.y)
    );
  } else if (L.barcode && batch.carton_barcode && batch.carton_barcode.trim()) {
    const barImg = await loadImgFromUrl(buildBarcodeUrl(batch.carton_barcode, 140, 1000, batch.barcode_type || "auto"));
    ctx.drawImage(
      barImg,
      mm(L.barcode.x),
      mm(L.barcode.y),
      mm(L.barcode.w),
      mm(L.barcode.h)
    );

    // Human-readable carton barcode value, centered below the barcode,
    // auto-shrunk so it always fits the barcode width.
    const centerX = mm(L.barcode.x + L.barcode.w / 2);
    const textY = mm(L.barcode.y + L.barcode.h + 1);
    const maxTextW = mm(L.barcode.w);
    let sizePt = 8;
    let fontPx = sizePt * (RENDER_DPI / 72);
    ctx.font = `${fontPx}px ui-monospace, Menlo, monospace`;
    while (ctx.measureText(batch.carton_barcode).width > maxTextW && sizePt > 4) {
      sizePt -= 0.5;
      fontPx = sizePt * (RENDER_DPI / 72);
      ctx.font = `${fontPx}px ui-monospace, Menlo, monospace`;
    }
    ctx.fillStyle = "#0f172a";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(batch.carton_barcode, centerX, textY);
    ctx.textAlign = "left";
  }

  return canvas;
}

const PRINT_DPI = 300;
const PRINT_PX_PER_MM = PRINT_DPI / 25.4;

/**
 * Builds the full page canvas for a template — the exact layout used for both
 * PDF export and direct browser printing (identical output).
 */
export function buildPageCanvas(template, labelCanvas) {
  const W = Math.round(template.pageW * PRINT_PX_PER_MM);
  const H = Math.round(template.pageH * PRINT_PX_PER_MM);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  if (["60x40", "60x100", "60x100Portrait", "50x100Portrait", "70x50Portrait"].includes(template.id)) {
    // 60x40 / 60x100 label rotated 90° clockwise, placed in the top-left
    // corner of the page (rotated label is 40x60mm / 100x60mm).
    // 60x100Portrait / 50x100Portrait: the 100×60mm label rotated 90° fills
    // the portrait page exactly at (0,0) — 100% scale, 0 margins.
    const rot = document.createElement("canvas");
    rot.width = labelCanvas.height;
    rot.height = labelCanvas.width;
    const rctx = rot.getContext("2d");
    rctx.fillStyle = "#ffffff";
    rctx.fillRect(0, 0, rot.width, rot.height);
    rctx.save();
    rctx.translate(rot.width, 0);
    rctx.rotate(Math.PI / 2);
    rctx.drawImage(labelCanvas, 0, 0);
    rctx.restore();
    const destDims = {
      "60x40": [40, 60],
      "60x100": [100, 60],
      "60x100Portrait": [60, 100],
      "50x100Portrait": [50, 100],
      "70x50Portrait": [50, 70],
    };
    const [destW, destH] = destDims[template.id];
    ctx.drawImage(rot, 0, 0, destW * PRINT_PX_PER_MM, destH * PRINT_PX_PER_MM);
  } else if (template.id === "50x80") {
    // 50×80mm portrait thermal sticker — label is already 50×80 portrait,
    // drawn directly to fill the page with no rotation.
    ctx.drawImage(labelCanvas, 0, 0, W, H);
  } else if (template.id === "custom") {
    // Custom template: page size, label size, rotation, scale, margin and
    // page-fill all come from the user's manual inputs.
    const rotDeg = Number(template.rotation) || 0;
    const margin = Number(template.margin) || 0;
    const labelW = Number(template.labelW) || 60;
    const labelH = Number(template.labelH) || 40;
    const swap = rotDeg === 90 || rotDeg === 270;
    const drawW0 = swap ? labelH : labelW;
    const drawH0 = swap ? labelW : labelH;
    const availW = Math.max(1, template.pageW - margin * 2);
    const availH = Math.max(1, template.pageH - margin * 2);
    let scale = (Number(template.scale) || 100) / 100;
    if (template.fill) scale = Math.min(availW / drawW0, availH / drawH0);
    const drawW = drawW0 * scale;
    const drawH = drawH0 * scale;
    const turns = Math.round((((rotDeg / 90) % 4) + 4) % 4);
    let src = labelCanvas;
    if (turns > 0) {
      const rot = document.createElement("canvas");
      if (turns === 2) {
        rot.width = labelCanvas.width;
        rot.height = labelCanvas.height;
      } else {
        rot.width = labelCanvas.height;
        rot.height = labelCanvas.width;
      }
      const rctx = rot.getContext("2d");
      rctx.fillStyle = "#ffffff";
      rctx.fillRect(0, 0, rot.width, rot.height);
      rctx.translate(rot.width / 2, rot.height / 2);
      rctx.rotate((turns * Math.PI) / 2);
      rctx.drawImage(labelCanvas, -labelCanvas.width / 2, -labelCanvas.height / 2);
      src = rot;
    }
    ctx.drawImage(
      src,
      margin * PRINT_PX_PER_MM,
      margin * PRINT_PX_PER_MM,
      drawW * PRINT_PX_PER_MM,
      drawH * PRINT_PX_PER_MM
    );
  } else {
    // 100x150 template: scale 250% (-> 150x100mm) & rotate 90° CW (-> 100x150mm) to fill page
    ctx.save();
    ctx.translate(W, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(labelCanvas, 0, 0, 150 * PRINT_PX_PER_MM, 100 * PRINT_PX_PER_MM);
    ctx.restore();
  }

  return c;
}