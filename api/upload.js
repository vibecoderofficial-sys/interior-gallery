// Vercel serverless function: password check + commit one photo to GitHub
const crypto = require('crypto');
const same = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const slugify = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { GITHUB_TOKEN: token, GITHUB_REPO: repo, GITHUB_BRANCH: branch = 'main', ADMIN_PASSWORD: pw } = process.env;
  if (!token || !repo || !pw) return res.status(500).json({ error: 'Server is not configured (missing environment variables).' });
  const { password, action, album, title, filename, data } = req.body || {};
  if (!same(password, pw)) return res.status(401).json({ error: 'Wrong password.' });
  if (action === 'verify') return res.json({ ok: true });

  const slug = slugify(album);
  const name = String(filename || '').toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  if (!slug) return res.status(400).json({ error: 'Album name is required.' });
  if (!/\.(jpe?g|png|webp)$/.test(name)) return res.status(400).json({ error: 'Only jpg, png or webp images.' });
  const content = String(data || '').replace(/^data:[^,]+,/, '');
  if (!content) return res.status(400).json({ error: 'Empty file.' });

  const put = async (p, b64, msg) => {
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/${p}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'interior-gallery', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, content: b64, branch })
    });
    return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
  };
  try {
    if (title) await put(`public/images/${slug}/title.txt`, Buffer.from(String(title).slice(0, 60)).toString('base64'), `Create album ${slug}`);
    const r = await put(`public/images/${slug}/${name}`, content, `Add ${slug}/${name}`);
    if (!r.ok) return res.status(502).json({ error: `GitHub: ${r.body.message || r.status}` });
    return res.json({ ok: true, album: slug, file: name });
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
};
