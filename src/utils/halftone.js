// Converts an image into a halftone dot pattern on a transparent background:
// dot radius scales with how dark (and opaque) each grid cell is, so light/white
// areas naturally shrink to nothing instead of leaving a white box behind. Each
// dot is filled with that cell's own average color (sampled from whatever image
// is passed in), so applying this alone keeps the original colors — it only
// looks black & white when fed an already-grayscale image (e.g. when the user
// also enables the grayscale option first).
const MAX_DIM = 1000;
const CELL_SIZE = 20;

export function convertToHalftone(dataUrl, { cellSize = CELL_SIZE } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const srcCanvas = document.createElement("canvas");
        srcCanvas.width = width;
        srcCanvas.height = height;
        const srcCtx = srcCanvas.getContext("2d");
        srcCtx.drawImage(img, 0, 0, width, height);
        const { data } = srcCtx.getImageData(0, 0, width, height);

        const outCanvas = document.createElement("canvas");
        outCanvas.width = width;
        outCanvas.height = height;
        const outCtx = outCanvas.getContext("2d");

        const maxRadius = cellSize * 0.5;

        for (let y = 0; y < height; y += cellSize) {
          const cellH = Math.min(cellSize, height - y);
          for (let x = 0; x < width; x += cellSize) {
            const cellW = Math.min(cellSize, width - x);
            let rSum = 0;
            let gSum = 0;
            let bSum = 0;
            let lumSum = 0;
            let alphaSum = 0;
            let count = 0;
            for (let dy = 0; dy < cellH; dy++) {
              for (let dx = 0; dx < cellW; dx++) {
                const idx = ((y + dy) * width + (x + dx)) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const a = data[idx + 3];
                const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                lumSum += a > 0 ? lum : 1;
                alphaSum += a;
                rSum += r;
                gSum += g;
                bSum += b;
                count++;
              }
            }
            const avgLum = lumSum / count;
            const avgAlpha = alphaSum / (count * 255);
            const darkness = (1 - avgLum) * avgAlpha;
            const radius = maxRadius * Math.min(1, darkness);
            if (radius < 0.4) continue;
            outCtx.fillStyle = `rgb(${Math.round(rSum / count)}, ${Math.round(gSum / count)}, ${Math.round(bSum / count)})`;
            outCtx.beginPath();
            outCtx.arc(x + cellW / 2, y + cellH / 2, radius, 0, Math.PI * 2);
            outCtx.fill();
          }
        }

        resolve(outCanvas.toDataURL("image/png"));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
