// Scans public/images/<album>/ and writes public/gallery.json (runs on every Vercel deploy)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, 'public', 'images');
const nice = s => s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const albums = [];
for (const id of fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort()) {
  const dir = path.join(root, id);
  const files = fs.readdirSync(dir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const items = [];
  for (const f of files) {
    const src = `images/${id}/${f}`;
    if (/\.poster\.jpg$/i.test(f)) continue;
    if (/\.(jpe?g|png|webp)$/i.test(f)) items.push({ type: 'image', src });
    else if (/\.(mp4|webm)$/i.test(f)) {
      const poster = f.replace(/\.[^.]+$/, '.poster.jpg');
      items.push({ type: 'video', src, poster: files.includes(poster) ? `images/${id}/${poster}` : '' });
    }
  }
  const tf = path.join(dir, 'title.txt');
  const title = fs.existsSync(tf) ? fs.readFileSync(tf, 'utf8').trim() : nice(id);
  if (items.length) albums.push({ id, title, items });
}
fs.writeFileSync(path.join(__dirname, 'public', 'gallery.json'), JSON.stringify(albums));
console.log(`gallery.json: ${albums.length} albums`);
