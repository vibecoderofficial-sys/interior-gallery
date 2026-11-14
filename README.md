# Interior Works Gallery

Static gallery on Vercel. Photos are saved permanently in this GitHub repo: `public/images/<album-name>/`.

## Setup (once)
1. Create a GitHub repo and push this folder.
2. GitHub > Settings > Developer settings > Fine-grained tokens: create a token for this repo only, permission **Contents: Read and write**.
3. Vercel > Add New Project > import the repo (no framework needed).
4. Vercel > Settings > Environment Variables:
   - `GITHUB_TOKEN`  your token
   - `GITHUB_REPO`   `yourname/your-repo`
   - `GITHUB_BRANCH` `main` (only if your branch has another name)
   - `ADMIN_PASSWORD` a password you choose
5. Redeploy once.

## Using it
Open `https://your-site.vercel.app/?admin` once on your device. The menu (☰) then shows **Upload photos** and **New album**.
Visitors do not see these options, and uploading always needs the password.

## Customize
Edit the `CONFIG` block at the top of the script in `public/index.html` (title, tagline, WhatsApp/Instagram menu links).
Album names come from `public/images/<folder>/title.txt`. Photos are sorted by file name.

## Local preview
`node build.js` then serve the `public` folder (for example `npx serve public`). Uploading only works when deployed.
