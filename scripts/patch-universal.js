#!/usr/bin/env node
/**
 * Patches @electron/universal to respect force:true for mismatched code signatures
 * between x64 and arm64 builds (needed for universal binary creation).
 */
const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname,
  '..',
  'node_modules',
  '@electron',
  'packager',
  'node_modules',
  '@electron',
  'universal',
  'dist',
  'cjs',
  'index.js'
);

if (!fs.existsSync(file)) {
  console.log('patch-universal: file not found, skipping');
  process.exit(0);
}

let src = fs.readFileSync(file, 'utf8');

const original = `throw new Error('While trying to merge mach-o files across your apps we found a mismatch, the number of mach-o files is not the same between the arm64 and x64 builds');`;

if (src.includes('if (!opts.force)')) {
  console.log('patch-universal: already patched');
  process.exit(0);
}

if (!src.includes(original)) {
  console.log('patch-universal: target string not found, skipping');
  process.exit(0);
}

src = src.replace(
  original,
  `if (!opts.force) {\n                ${original}\n            }`
);

fs.writeFileSync(file, src);
console.log('patch-universal: patched @electron/universal');

// Also patch packager to pass force:true instead of force:false
const packagerFile = path.join(
  __dirname,
  '..',
  'node_modules',
  '@electron',
  'packager',
  'dist',
  'universal.js'
);

if (fs.existsSync(packagerFile)) {
  let psrc = fs.readFileSync(packagerFile, 'utf8');
  if (psrc.includes('force: false')) {
    psrc = psrc.replace('force: false', 'force: true');
    fs.writeFileSync(packagerFile, psrc);
    console.log('patch-universal: patched @electron/packager');
  }
}
