# ButTaiwan — WriteMyFont Trainer

Guide rapide pour déployer et lancer l'application.

Prérequis
- Node.js (>=16) et npm
- Compte GitHub (pour héberger le repo)
- (optionnel) compte Netlify ou Vercel

1) Initialiser le repo et pousser sur GitHub
- Dans le dossier du projet :
  git init
  git add .
  git commit -m "Initial commit"
  # crée un repo GitHub et ensuite :
  git remote add origin https://github.com/<ton-utilisateur>/<ton-repo>.git
  git branch -M main
  git push -u origin main

2) Développement local (accès tablette sur réseau Wi‑Fi)
- npm install
- npm run dev -- --host
- Ouvre sur ta tablette : http://<IP_DE_TON_ORDI>:5173

3) Build production et serveur local (plus stable)
- npm run build
- npm run serve:dist
- Ouvre sur ta tablette : http://<IP_DE_TON_ORDI>:5000

4) Déployer sur Netlify (recommandé, simple)
Option A — Connecter via UI :
- Va sur https://app.netlify.com/new
- Connecte ton compte GitHub, choisis le repo.
- Build command: `npm run build`
- Publish directory: `dist`
Netlify déploiera automatiquement à chaque push.

Option B — Drag & Drop (très simple) :
- npm run build
- Ouvre https://app.netlify.com/drop et glisse le dossier `dist`.

5) Déployer sur Vercel (autre option simple)
- Va sur https://vercel.com/new
- Connecte ton repo GitHub, choisis le projet.
- Build command: `npm run build`
- Output directory: `dist`
Vercel déploie automatiquement à chaque push.

6) Déployer sur GitHub Pages (script inclus)
- npm install
- npm run deploy:gh-pages
  (Le script construit puis publie `dist` sur la branche gh-pages via `gh-pages`.)
- Configure GitHub Pages dans les settings si nécessaire.

7) Remarques
- Netlify/Vercel sont les solutions les plus simples pour partager rapidement.
- Pour que la progression SRS soit partagée entre utilisateurs, il faudra un backend (Supabase/Firebase) — je peux t'aider à l'ajouter plus tard.

8) Besoin d'aide ?
Dis‑moi quel hébergeur tu veux (Netlify, Vercel ou GitHub Pages) et je te guide précisément pas à pas ou je prépare la config CI si tu veux tout automatiser.

Supabase integration (SRS sync & auth)
1. Create a project on https://app.supabase.com
2. In the Supabase SQL editor run this minimal table creation:

   create table if not exists srs (
     id uuid default gen_random_uuid() primary key,
     user_id text not null,
     deck text not null,
     payload jsonb,
     updated_at timestamptz default now()
   );
   create unique index on srs (user_id, deck);

3. (Optional) In Supabase → Auth → Settings allow email sign-ups.
4. Add environment variables in Netlify / Vercel (or .env.local during dev):
   - VITE_SUPABASE_URL = https://your-project-ref.supabase.co
   - VITE_SUPABASE_ANON_KEY = <anon-public-api-key>
5. On the frontend:
   - Sign in with your email (magic link). After signing in the app will automatically
     load and merge your remote SRS for the selected deck and save changes back.
6. Notes:
   - The app falls back to localStorage if Supabase env vars are not set.
   - Make sure to configure row-level security and policies if you want stricter access.
   - For production, set RLS policies so users can only access their own srs rows.

Supabase — Redirect URLs & magic-link troubleshooting
1) Very important: add the exact origin you want Supabase to redirect to:
   - In Supabase Console → Auth → Settings → Redirect URLs add the exact origin where users will land:
     - https://japanese-memory-app.netlify.app
     - https://japanese-memory-app.netlify.app/    (optional duplicate)
     - http://localhost:5173                       (for local dev)
   - In Supabase Console → Project Settings → General → Site URL set:
     - https://japanese-memory-app.netlify.app

2) Why this matters:
   - When the app requests a magic link we now explicitly ask Supabase to redirect to the current origin (the app uses window.location.origin).
   - Supabase will reject magic links that redirect to URLs not listed in Redirect URLs and the email will show "requested path is invalid".

3) If you see "requested path is invalid" in the email:
   - Open the magic-link email and inspect the URL (copy/paste the link into a text editor).
   - Look for a parameter like `redirect_to=` or check the destination path — it must exactly match one of the Redirect URLs.
   - If it does not, add that exact URL (including protocol and path) to the Redirect URLs list in Supabase or ensure the app passes window.location.origin when requesting the link.

4) Testing:
   - After adding Redirect URLs, go to the app, request a magic-link.
   - Click the link in the email (it should redirect back to your site).
   - If it does not, open DevTools Console for any errors and check Netlify env vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).

5) Security (RLS)
   - Don't forget to enable Row Level Security and add owner-only policies for the srs table (see the SQL snippet earlier in this README).
