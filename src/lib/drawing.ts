import type { Frame } from './types';
const connections = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];

export function drawHands(canvas: HTMLCanvasElement, frame: Frame, success: boolean) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = frame.width;
  canvas.height = frame.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const hand of frame.hands) {
    const p = hand.landmarks;
    const color = success ? '#dfef9d' : (hand.trackId ?? 1) % 2 ? '#65d8ff' : '#ffcf74';
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, canvas.width / 400);
    ctx.shadowColor = '#183e2b';
    ctx.shadowBlur = 7;
    for (const [a, b] of connections) {
      ctx.beginPath();
      ctx.moveTo(p[a].x * canvas.width, p[a].y * canvas.height);
      ctx.lineTo(p[b].x * canvas.width, p[b].y * canvas.height);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    for (const [i, point] of p.entries()) {
      ctx.beginPath();
      ctx.arc(point.x * canvas.width, point.y * canvas.height, i % 4 === 0 ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
}
