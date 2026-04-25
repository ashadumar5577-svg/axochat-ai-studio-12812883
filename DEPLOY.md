# Deploying AxoX

AxoX is a standard React + Vite app. It can be deployed anywhere static files
are served. The backend (database, auth, edge functions) is hosted on Lovable
Cloud and works from any frontend domain — there is **no host lock**.

## 1. One-click (Lovable hosting)

Click **Publish** in the Lovable editor. Your site goes live at
`https://axochat-ai-studio.lovable.app`.

To attach a custom domain (e.g. `axox.com`):
- Project Settings → Domains → Add domain
- Add the DNS records Lovable shows you at your registrar
- Done — both `axochat-ai-studio.lovable.app` and your custom domain work

## 2. GitHub + GitHub Pages

GitHub Pages serves static files, so a simple Action builds the Vite bundle
and publishes it.

### Steps

1. In Lovable: **GitHub → Connect → Create Repository**
2. In your new repo on GitHub: **Settings → Pages → Source = GitHub Actions**
3. Add the file `.github/workflows/deploy.yml` (already included in this repo)
4. Add **Repository secrets** (Settings → Secrets and variables → Actions):
   - `VITE_SUPABASE_URL` — copy from your local `.env`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` — copy from your local `.env`
   - `VITE_SUPABASE_PROJECT_ID` — copy from your local `.env`
5. Push to `main`. Action builds and deploys automatically.

Site goes live at `https://<username>.github.io/<repo>/`.

### Custom domain on GitHub Pages

- Repo → Settings → Pages → Custom domain → enter `axox.com`
- At your registrar add a `CNAME` record pointing `axox.com` → `<username>.github.io`
- GitHub auto-provisions HTTPS

## 3. Any other host (Vercel, Netlify, Cloudflare Pages, your own server)

Build command: `npm run build`
Output directory: `dist`
Required env vars:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

That's it — drop `dist/` on any static host. The backend keeps working from any
origin because Supabase/Lovable Cloud accepts cross-origin requests with the
publishable key.

## SPA routing note (GitHub Pages)

GitHub Pages doesn't have SPA fallback, so deep-links like `/chat` would 404 on
refresh. The included workflow copies `index.html` to `404.html` to fix this.
