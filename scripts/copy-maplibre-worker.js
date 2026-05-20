const fs = require('fs');
const path = require('path');

const source = require.resolve('maplibre-gl/dist/maplibre-gl-csp-worker.js');
const target = path.resolve(__dirname, '..', 'public', 'maplibre-gl-csp-worker.js');

fs.copyFileSync(source, target);
console.log(`Copied MapLibre worker to ${path.relative(process.cwd(), target)}`);
