const canvas = document.querySelector<HTMLCanvasElement>('#canvas-product');
const canvasContext = canvas?.getContext('2d');
if (canvas && canvasContext) {
  canvasContext.fillStyle = '#f2eadf';
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);
  canvasContext.fillStyle = '#577b78';
  canvasContext.beginPath();
  canvasContext.moveTo(175, 130);
  canvasContext.lineTo(270, 75);
  canvasContext.lineTo(390, 75);
  canvasContext.lineTo(485, 130);
  canvasContext.lineTo(550, 210);
  canvasContext.lineTo(495, 280);
  canvasContext.lineTo(450, 250);
  canvasContext.lineTo(450, 680);
  canvasContext.lineTo(210, 680);
  canvasContext.lineTo(210, 250);
  canvasContext.lineTo(165, 280);
  canvasContext.lineTo(110, 210);
  canvasContext.closePath();
  canvasContext.fill();
}

document.querySelector<HTMLButtonElement>('#add-gallery-image')?.addEventListener('click', () => {
  const gallery = document.querySelector<HTMLDivElement>('#dynamic-gallery');
  if (!gallery || gallery.childElementCount) return;
  const image = document.createElement('img');
  image.src = '/fixture/dress.png';
  image.alt = 'Dynamically loaded synthetic pleated dress';
  gallery.append(image);
});

const blobGallery = document.querySelector<HTMLDivElement>('#blob-gallery');
if (blobGallery) {
  const blob = new Blob(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="780"><rect width="600" height="780" fill="#eadfd2"/><path d="M240 100h120l90 80-45 100-40-25v370H235V255l-40 25-45-100z" fill="#884e64"/></svg>`,
    ],
    { type: 'image/svg+xml' },
  );
  const image = document.createElement('img');
  image.src = URL.createObjectURL(blob);
  image.alt = 'Synthetic blob URL garment requiring visible crop fallback';
  image.className = 'product-tile';
  blobGallery.append(image);
}

const frame = document.querySelector<HTMLIFrameElement>('#same-origin-frame');
if (frame) {
  frame.srcdoc = `<!doctype html><html><body style="margin:10px;font:16px system-ui"><h3>Synthetic same-origin gallery</h3><img src="${location.origin}/fixture/dress.png" alt="Synthetic iframe product image" style="width:300px;height:340px;object-fit:contain"></body></html>`;
}
