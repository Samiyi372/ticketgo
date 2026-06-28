const MAX_DIM = 1200;

function loadScaledCanvas(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Converts an image to grayscale in place, preserving alpha. A mild contrast
// boost is applied first (pushes tones away from mid-gray), then light tones
// above whiteThreshold are snapped to pure white so soft drop-shadows baked
// into a photo's background (common in product/stock photos) collapse to flat
// white instead of leaving a faint gray gradient behind once multiplied.
export async function convertToGrayscale(dataUrl, { whiteThreshold = 215, contrast = 1.25 } = {}) {
  const canvas = await loadScaledCanvas(dataUrl);
  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    let lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    lum = clamp((lum - 128) * contrast + 128, 0, 255);
    if (lum >= whiteThreshold) lum = 255;
    data[i] = data[i + 1] = data[i + 2] = lum;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
