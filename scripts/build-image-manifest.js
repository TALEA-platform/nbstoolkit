/**
 * Lists the case-study images in public/images (cs_<id>.<ext>) and writes
 * src/data/imageManifest.json ({ "<id>": "cs_<id>.<ext>" }).
 *
 * Runs automatically before `npm start` and `npm run build`, so adding or
 * replacing an image only requires dropping the file into public/images.
 */

const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.resolve(__dirname, '..', 'public', 'images');
const OUTPUT = path.resolve(__dirname, '..', 'src', 'data', 'imageManifest.json');
const PATTERN = /^cs_(\d+)\.(png|jpe?g|webp|avif)$/i;

const manifest = {};
for (const file of fs.readdirSync(IMAGES_DIR).sort()) {
  const match = file.match(PATTERN);
  if (!match) continue;
  const id = Number(match[1]);
  if (manifest[id]) {
    console.warn(`Warning: more than one image for case ${id} (${manifest[id]}, ${file}); using ${manifest[id]}`);
    continue;
  }
  manifest[id] = file;
}

const sorted = Object.fromEntries(Object.keys(manifest).map(Number).sort((a, b) => a - b).map(id => [id, manifest[id]]));
const json = JSON.stringify(sorted, null, 2) + '\n';
const previous = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
if (json !== previous) fs.writeFileSync(OUTPUT, json, 'utf8');
console.log(`Image manifest: ${Object.keys(sorted).length} images in public/images`);
