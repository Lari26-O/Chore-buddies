# Put Chore Buddies on its own website, with saved accounts

Two free accounts, about 20 minutes, all doable from an iPad:

- **Cloudflare Pages** gives the app its own web address, so it doesn't depend on Claude. It updates itself every time new changes are saved to GitHub. The microphone works there.
- **Supabase** stores the family accounts in the cloud, so you can sign in on any phone or tablet and the kids, coins, chores and worlds sync between devices.

---

## Part 1: The website (Cloudflare Pages), about 10 minutes

1. Go to **dash.cloudflare.com** and make a free account.
2. Tap **Workers & Pages → Create → Pages → Connect to Git**.
3. Sign in with GitHub and allow access to the **Weeklan** repository.
4. Use these settings:
   - Production branch: **claude/chore-buddies**
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **chore-buddies**
5. Tap **Save and Deploy**. You get an address like `https://weeklan.pages.dev`.
   (You can rename the project, for example to get `https://chore-buddies.pages.dev`.)
6. On each phone or iPad: open the address in **Safari → Share → Add to Home Screen**.
   It opens full screen like a real app and keeps working with no internet.

The app works now. Each device keeps its own family until you do Part 2.

---

## Part 2: Saved accounts (Supabase), about 10 minutes

1. Go to **supabase.com**, make a free account, and tap **New project**.
   Pick any name and a database password, and save the password somewhere safe.
2. Open **SQL Editor → New query**. Paste the whole file `chore-buddies/supabase/002_cloud_sync.txt`
   from GitHub into it and tap **Run**. (You don't need `001_family_accounts.txt`; it's an older design.)
3. **Authentication → Sign In / Providers → Email**: keep **Confirm email** turned ON.
4. **Authentication → URL Configuration**:
   - Site URL: your Cloudflare address from Part 1 (for example `https://weeklan.pages.dev`)
   - Redirect URLs: add the same address
5. **Project Settings → API** (also shown as "Data API" or "API Keys"): copy the **Project URL** and the **anon public** key.
   The anon key is meant to be public; the database rules from step 2 protect each family's data.
6. Open the app at your Cloudflare address and go to **Parent → Controls → Use on several phones**.
   Paste the URL and key, tap **Connect**, and sign up with your email.
   Tap the confirmation link Supabase emails you, then sign in.

### Adding the other devices
- **The other parent:** in Controls, tap to show the **family code**. On their phone they sign up with *their own* email and enter that 6-letter code.
- **A kid's own iPad:** sign in with a parent account once, then switch to the kid. Kids never need an email.

### Want to skip pasting the key on every device?
Send the Project URL and anon public key to Claude, and they'll be built into the app so it connects by itself.

---

## Good to know
- Inside the Claude app, cloud accounts and the microphone are blocked. They work on your own website.
- Free plans are enough for a family.
- Your data belongs to your own Supabase project, and only your family's signed-in accounts can read it.
