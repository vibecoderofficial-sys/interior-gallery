// Vercel serverless function: password check + upload / rename / delete, saved straight to GitHub
const crypto = require('crypto');
const same = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const slugify = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const ROOT = 'public/images/';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { GITHUB_TOKEN: token, GITHUB_REPO: repo, GITHUB_BRANCH: branch = 'main', ADMIN_PASSWORD: pw } = process.env;
  if (!token || !repo || !pw) return res.status(500).json({ error: 'Server is not configured (missing environment variables).' });
  const b = req.body || {};
  if (!same(b.password, pw)) return res.status(401).json({ error: 'Wrong password.' });
  const action = b.action || 'upload';
  if (action === 'verify') return res.json({ ok: true });

  const H = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'interior-gallery', 'Content-Type': 'application/json' };
  const gh = async (method, url, body) => {
    const r = await fetch(`https://api.github.com/repos/${repo}/${url}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`GitHub: ${j.message || r.status}`);
    return j;
  };
  // Current state of the branch: head commit + every file path
  const snapshot = async () => {
    const ref = await gh('GET', `git/ref/heads/${branch}`);
    const commit = await gh('GET', `git/commits/${ref.object.sha}`);
    const tree = await gh('GET', `git/trees/${commit.tree.sha}?recursive=1`);
    return { head: ref.object.sha, treeSha: commit.tree.sha, files: tree.tree.filter(e => e.type === 'blob') };
  };
  // One commit with many changes (so Vercel redeploys once)
  const commit = async (snap, entries, message) => {
    const t = await gh('POST', 'git/trees', { base_tree: snap.treeSha, tree: entries });
    const c = await gh('POST', 'git/commits', { message, tree: t.sha, parents: [snap.head] });
    await gh('PATCH', `git/refs/heads/${branch}`, { sha: c.sha });
  };
  const del = f => ({ path: f.path, mode: f.mode, type: 'blob', sha: null });
  const fail = (code, error) => res.status(code).json({ error });

  try {
    const slug = slugify(b.album);
    if (!slug) return fail(400, 'Album name is required.');
    const prefix = `${ROOT}${slug}/`;

    if (action === 'upload') {
      const name = String(b.filename || '').toLowerCase().replace(/[^a-z0-9._-]/g, '-');
      if (!/\.(jpe?g|png|webp)$/.test(name)) return fail(400, 'Only jpg, png or webp images.');
      const content = String(b.data || '').replace(/^data:[^,]+,/, '');
      if (!content) return fail(400, 'Empty file.');
      const put = (p, b64, msg) => gh('PUT', `contents/${p}`, { message: msg, content: b64, branch });
      if (b.title) await put(`${prefix}title.txt`, Buffer.from(String(b.title).slice(0, 60)).toString('base64'), `Create album ${slug}`);
      await put(`${prefix}${name}`, content, `Add ${slug}/${name}`);
      return res.json({ ok: true, album: slug, file: name });
    }

    const snap = await snapshot();
    const inAlbum = snap.files.filter(f => f.path.startsWith(prefix));
    if (!inAlbum.length) return fail(404, 'That album is not in GitHub yet (wait a minute after uploading, then refresh).');

    if (action === 'delete-album') {
      await commit(snap, inAlbum.map(del), `Delete album ${slug}`);
      return res.json({ ok: true });
    }

    if (action === 'delete-photo') {
      const file = String(b.file || '').replace(/[^A-Za-z0-9._-]/g, '');
      const target = inAlbum.find(f => f.path === prefix + file);
      if (!file || !target || file === 'title.txt') return fail(404, 'Photo not found in GitHub yet (wait a minute, then refresh).');
      const gone = [target];
      const poster = inAlbum.find(f => f.path === prefix + file.replace(/\.[^.]+$/, '.poster.jpg'));
      if (poster && /\.(mp4|webm)$/i.test(file)) gone.push(poster);
      const left = inAlbum.filter(f => !gone.includes(f) && !/(^|\/)title\.txt$/.test(f.path) && !/\.poster\.jpg$/i.test(f.path));
      await commit(snap, (left.length ? gone : inAlbum).map(del), `Delete ${slug}/${file}`);
      return res.json({ ok: true, albumRemoved: !left.length });
    }

    if (action === 'rename-album') {
      const newName = String(b.newName || '').trim().slice(0, 40), newSlug = slugify(newName);
      if (!newSlug) return fail(400, 'Enter a new album name.');
      const titleEntry = p => ({ path: p, mode: '100644', type: 'blob', content: newName });
      if (newSlug === slug) { await commit(snap, [titleEntry(`${prefix}title.txt`)], `Rename album ${slug}`); return res.json({ ok: true, album: slug }); }
      const newPrefix = `${ROOT}${newSlug}/`;
      if (snap.files.some(f => f.path.startsWith(newPrefix))) return fail(409, 'An album with that name already exists.');
      const entries = [];
      for (const f of inAlbum) {
        entries.push(del(f));
        if (!/(^|\/)title\.txt$/.test(f.path)) entries.push({ path: newPrefix + f.path.slice(prefix.length), mode: f.mode, type: 'blob', sha: f.sha });
      }
      entries.push(titleEntry(`${newPrefix}title.txt`));
      await commit(snap, entries, `Rename album ${slug} to ${newSlug}`);
      return res.json({ ok: true, album: newSlug });
    }
    return fail(400, 'Unknown action.');
  } catch (e) { return fail(500, String(e.message || e)); }
};
