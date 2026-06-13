// Rasterises public/icon.svg into the PNG sizes the manifest and iOS need.
// Run with: node scripts/gen-icons.mjs
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pub = join(root, 'public')
const svg = await readFile(join(pub, 'icon.svg'))

const targets = [
  { file: 'pwa-192.png', size: 192 },
  { file: 'pwa-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
]

for (const { file, size } of targets) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(join(pub, file))
  console.log(`wrote public/${file} (${size}px)`)
}

// Maskable: same art but with extra padding so platform masks don't clip it.
const padded = Buffer.from(
  `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="#0d1a20"/><g transform="translate(64 64) scale(0.75)">${svg
    .toString()
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')}</g></svg>`,
)
await sharp(padded, { density: 384 }).resize(512, 512).png().toFile(join(pub, 'maskable-512.png'))
console.log('wrote public/maskable-512.png (512px, padded)')
