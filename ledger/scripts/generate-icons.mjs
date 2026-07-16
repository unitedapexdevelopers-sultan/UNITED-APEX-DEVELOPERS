import sharp from "sharp";
import { mkdirSync } from "fs";

const BG = "#0F1216";
const GOLD = "#C9A24B";

mkdirSync("public/icons", { recursive: true });

// Three ascending bars (PnL/trading mark), centered by construction — no font-metric guesswork.
// `pad` controls how much margin surrounds the mark; maskable icons need a larger safe-zone margin.
function barsSvg(size, pad) {
  const inner = size - pad * 2;
  const barW = inner / 5;
  const gap = barW / 2;
  const heights = [inner * 0.42, inner * 0.68, inner * 1.0];
  const totalW = barW * 3 + gap * 2;
  const startX = (size - totalW) / 2;
  const baseY = size - pad;
  const radius = barW * 0.28;

  const bars = heights
    .map((h, i) => {
      const x = startX + i * (barW + gap);
      const y = baseY - h;
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" rx="${radius.toFixed(2)}" fill="${GOLD}"/>`;
    })
    .join("\n");

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${BG}"/>
    ${bars}
  </svg>`;
}

const jobs = [
  { svg: barsSvg(192, 192 * 0.22), out: "public/icons/icon-192.png", size: 192 },
  { svg: barsSvg(512, 512 * 0.22), out: "public/icons/icon-512.png", size: 512 },
  { svg: barsSvg(192, 192 * 0.32), out: "public/icons/icon-maskable-192.png", size: 192 },
  { svg: barsSvg(512, 512 * 0.32), out: "public/icons/icon-maskable-512.png", size: 512 },
  { svg: barsSvg(512, 512 * 0.22), out: "src/app/icon.png", size: 512 },
  { svg: barsSvg(180, 180 * 0.22), out: "src/app/apple-icon.png", size: 180 },
];

for (const job of jobs) {
  await sharp(Buffer.from(job.svg)).resize(job.size, job.size).png().toFile(job.out);
  console.log("wrote", job.out);
}
