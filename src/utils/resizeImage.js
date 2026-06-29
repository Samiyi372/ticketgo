// Caps how much storage one uploaded image can ever consume. The ticket is
// printed at 300dpi but is only 200x80mm overall, and uploaded images are
// always decorations/backgrounds covering a fraction of that — so 1600px on
// the long edge is already well beyond what the final print can resolve.
// Without this, a raw phone photo (often 8-12MB) gets stored verbatim, and a
// handful of those is enough to exhaust any browser storage quota.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

// Whether a file *claims* to be PNG says nothing about whether it actually
// uses transparency — phone screenshots and exported photos are routinely
// saved as opaque PNGs, and re-encoding those losslessly can stay several MB
// even after the resize, undoing the whole point of this step. Checking the
// real alpha channel means only images that truly need it pay the PNG cost;
// everything else gets the much smaller JPEG encoding.
function canvasHasTransparency(ctx, width, height) {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

export function resizeImageDataUrl(dataUrl, { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const useAlpha = canvasHasTransparency(ctx, width, height);
        resolve(useAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", quality));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
