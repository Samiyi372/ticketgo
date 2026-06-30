// Recolours a decoration image by mapping each pixel's luminance onto a
// gradient from the tint colour (dark pixels) to white (light pixels).
// Transparent pixels keep their alpha unchanged, so halftone dots and
// PNG cutouts stay transparent after tinting.
export function tintImageDataUrl(dataUrl, hexColor) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        const tr = parseInt(hexColor.slice(1, 3), 16);
        const tg = parseInt(hexColor.slice(3, 5), 16);
        const tb = parseInt(hexColor.slice(5, 7), 16);

        for (let i = 0; i < data.length; i += 4) {
          const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
          // dark pixel → tint colour, light pixel → white
          data[i]     = Math.round(tr + (255 - tr) * lum);
          data[i + 1] = Math.round(tg + (255 - tg) * lum);
          data[i + 2] = Math.round(tb + (255 - tb) * lum);
          // data[i + 3]: alpha unchanged
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
