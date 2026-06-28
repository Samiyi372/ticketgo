// Extracts the K most dominant colors from an image via k-means clustering on
// a downsampled set of pixels, similar in spirit to coolors.co/image-picker
// but fully automatic (no manual pick points).
const SAMPLE_DIM = 150;
const ITERATIONS = 8;

export async function extractPalette(dataUrl, k = 5) {
  const pixels = await loadPixels(dataUrl);
  if (pixels.length === 0) return [];

  let centroids = Array.from({ length: k }, (_, i) => pixels[Math.floor((i / k) * pixels.length)]);
  let assignments = new Array(pixels.length).fill(0);

  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (let p = 0; p < pixels.length; p++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = dist2(pixels[p], centroids[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      assignments[p] = best;
    }

    const sums = Array.from({ length: centroids.length }, () => [0, 0, 0, 0]);
    for (let p = 0; p < pixels.length; p++) {
      const c = assignments[p];
      sums[c][0] += pixels[p][0];
      sums[c][1] += pixels[p][1];
      sums[c][2] += pixels[p][2];
      sums[c][3] += 1;
    }
    centroids = sums.map((s, i) => (s[3] > 0 ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centroids[i]));
  }

  const counts = new Array(centroids.length).fill(0);
  assignments.forEach((c) => counts[c]++);
  const order = counts.map((_, i) => i).sort((a, b) => counts[b] - counts[a]);
  return order.filter((i) => counts[i] > 0).map((i) => rgbToHex(centroids[i]));
}

function loadPixels(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, SAMPLE_DIM / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const { data } = ctx.getImageData(0, 0, width, height);
        const pixels = [];
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          pixels.push([data[i], data[i + 1], data[i + 2]]);
        }
        resolve(pixels);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function dist2(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}
