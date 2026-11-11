# Link Cable

A private, console-style library for your own cartridge dumps (GB / GBC / GBA / DS). Play in the browser with cloud saves that follow you, and invite a friend to run their own library on the same site.

A private, password-protected cartridge library for your own ROM dumps (GB / GBC / GBA / DS).
It plays them in the browser with EmulatorJS and syncs saves to your own cloud bucket, so you can pick up on any device.

```
Browser ──login──▶ Vercel (Next.js: auth + tiny API, signs URLs)
   │                         │
   │  presigned PUT/GET      ▼
   └────────────────▶  Cloudflare R2 bucket (private)
                         roms/<id>/rom.bin
                         roms/index.json
                         saves/<id>/meta.json + v/<version>.state|.sav
```

ROMs and saves never pass through Vercel. The browser uploads and downloads them straight from the bucket using short-lived signed URLs, which avoids Vercel's 4.5 MB request limit. The bucket stays private.

## Setup (≈10 min)

### 1. Storage bucket: Backblaze B2 (free, no card)
1. Sign up at backblaze.com (B2 Cloud Storage). The first 10 GB are free and no credit card is needed.
2. Go to **Buckets → Create a Bucket**, name it (e.g. `link-cable`), and keep it **Private**. Note the **Endpoint** shown on the bucket, e.g. `s3.eu-central-003.backblazeb2.com`. The region is the middle part (`eu-central-003`).
3. Go to **Application Keys → Add a New Application Key**, allow access to that bucket only, with *Read and Write*. Copy the **keyID** and **applicationKey** (shown once).
4. Optional but recommended: open **Caps & Alerts** and set every cap to $0, so B2 refuses work instead of ever billing.
5. After deploying, sign in as the owner and open **Settings → Storage → Upload permissions → Set up**. This writes the bucket's CORS rule for your site.

The app also enforces its own ceiling: uploads that would push the bucket past `STORAGE_LIMIT_GB` (default 9) are refused, and Settings → Storage shows the bucket meter.

Any other S3-compatible store also works (Cloudflare R2, AWS S3, MinIO). Set `S3_FORCE_PATH_STYLE=1` for MinIO.

### 2. Environment variables
Copy `.env.example` to `.env.local` for local dev, and add the same variables in **Vercel → Project → Settings → Environment Variables**:

| var | value |
|---|---|
| `INVITE_CODE` | code a friend needs to create an account (the first account, yours, needs none). Empty = sign-ups closed |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `S3_ENDPOINT` / `S3_REGION` (`auto`) / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | from step 1 |

### 3. Run / deploy
```bash
npm install
npm run dev          # http://localhost:3000
```
Push to GitHub and import the repo in Vercel. No other config is needed.

## Accounts
- **First visit:** "Welcome! Create your account". The first account is the owner and needs no code.
- **Friends:** *Add user* on the "Who's playing?" screen, with the `INVITE_CODE`. Remove the env var to close sign-ups.
- **Privacy between users:** each user's games and saves live under their own folder in the bucket (`u/<id>/…`), and every API call is scoped to the signed-in user. Two people can play at the same time on different devices without affecting each other.
- **Passwords** are hashed (PBKDF2-SHA256, 210k rounds). Change yours, or your avatar colour, in Settings → Account. Switch accounts from the menu → *Switch user*.

## Profile pictures
Settings → Account (or the profile menu) → **Profile picture**. Pick from ~250 Nintendo characters (amiibo figures via [AmiiboAPI](https://www.amiiboapi.org), grouped by series) or all 1,025 Pokémon ([PokéAPI](https://pokeapi.co) official artwork, grouped by region). Only the name list is cached in the bucket; images load from those projects' GitHub hosting, and only those hosts are accepted.

## Home screen
- **Tile row:** stays put until you pass the 3rd game, then keeps the selected game in the middle of five, with two games of buffer on each side. It clamps at both ends. Soft edge fades show there's more in that direction and fade away when you reach the end. Mouse wheel, trackpad and swipe step one game at a time.
- **Background:** slow, drifting colour washes tinted with the median colour of the selected game's box art (white borders and black outlines are ignored), cross-fading as you move.
- **Shortcut:** on the home row, **hold ↓** to open **All Games**. "All Games" fills up as you hold and the row lifts. A short tap still moves down to the dock.
- **Quick menu:** click your picture (or F1 / − / Home) for your profile, a theme switch, sounds, Security, Switch user and **Log out**. Navigation lives in the dock.

## Profile & security
Settings → **Profile**: picture, display name, colour, stats. Settings → **Security**: change password (needs the current one; signs out other devices), sign out other devices, and either *People on this PC* (owner: see and remove accounts) or *Delete my account* (members).

## Labs (PTR)
Hidden experimental features. To unlock, open Settings → About and tap **Build** five times. Labs is stored per browser, so it never affects anyone else's view.
- **Profile frames:** XP from play time and achievements raises your account level, from 0 to 999. Ten materials: Cartridge (0–10) → Bronze (11) → Silver (30) → Gold (60) → Platinum (100) → Jade (160) → Cobalt (240) → Diamond (350) → Holo Foil (500) → Prism (700). Every tier after Cartridge has seven stages: plain → one gem → two → three → laurel wreath → the top gem becomes a star → all three become stars. Diamond and up sparkle; Lv 999 adds the crown. A diagonal reflection sweeps the whole border (more often from Diamond up). *Minimal frames* shows a thin ring only; *None* a plain picture.
- **Badges:** 15 Forza Horizon–style sticker icons, each with Earned → Silver → Gold steps. Equip one.
- **Test mode:** try any level and every badge on your own account. Local to your browser, never published.

## Cover art
ROM files contain no artwork, so covers come from the **libretro-thumbnails** box-art library (the one RetroArch uses), which is named after the No-Intro database.
- **On upload,** the server reads the cartridge header (internal title, game code, region) and combines it with the filename to find the right entry. Even `game1.gba` is recognised as *Pokemon - Emerald Version*. Only that single image is downloaded and stored in your bucket, and the game takes the official title.
- **Uncertain matches** are never guessed. Use the game page → 🖼 → *Choose cover art* (best matches plus search), or upload your own.
- **Existing games:** Settings → Storage → *Find missing covers*.
- The name index (~6k GBA, ~7k DS, ~3k GB/GBC entries) is cached in the bucket for a week, shared by all users.

## How saving works

- **On boot**, the newest cloud save is pulled. The save state is restored, and so is the in-game battery save (`.sav`).
- **While playing**, it autosaves every 45 s. If nothing changed, for example while paused, it uploads nothing.
- **When you leave the tab** (switch tabs, switch apps on your phone, minimise, close), it saves right away and pauses the game. `visibilitychange` is the one "leaving" signal browsers reliably fire on every platform, including mobile.
- **Closing or reloading with unsynced progress** shows the browser's "Leave site?" prompt while the final save uploads in the background. Browsers can't guarantee a multi-MB upload finishes after a tab is gone, so this is the reminder.
- **`◀ PC` / Esc** opens *"Would you like to SAVE the game?"* → **SAVE & QUIT** is the clean exit.
- The **save-state buttons in the emulator menu** write to and read from the cloud, not your downloads folder.
- **Cross-device safety:** every save is a new version, and `meta.json` is switched over only after the upload completes. If another device saved newer progress since you loaded, you get asked which save to keep instead of losing either one. The last ~6 versions are kept as **BACKUPS** in the summary panel and can be restored.
- **There is no server to shut down.** The emulator runs entirely in your browser tab, and the Vercel API only runs for the split second of each request (serverless). Closing the tab is the shutdown.

A save is the raw state (gzip-compressed) plus the cartridge `.sav`. The `.sav` is what survives EmulatorJS core updates, because states are tied to a core version.

ROMs are cached per device (Cache Storage), so a big DS ROM downloads only once per browser.

## The UI
Big Picture's structure and flow with a Switch 2 look: light and dark themes (or follow your device), rounded square tiles, a pulsing cyan focus ring, a round icon dock, and soft colour washes tinted by the focused game.

- **Home:** recently played games as square tiles, with the focused one enlarged. The game's name and **A Start / + Options** sit beside the dock (Library · Save Timeline · Add Games · Search · Settings) and your profile avatar (quick menu). **Hold ↓** on the carousel to jump to All Games.
- **Library:** a grid of game cards with system filter tabs (L/R).
- **Save Timeline:** an activity feed of every cloud save from every device, grouped by day, with screenshots.
- **Game page** (+ / Options): a hero banner, a Play bar with stats, and **Cloud Saves** (restore any backup) / **Game Info** tabs. You can change the cover, rename or delete from here.
- **Search:** full screen, with system filter pills.
- **Settings:** theme (Light / Dark / Auto), reduce motion, interface sounds, 24-hour clock, storage and ROM cache.
- **Art:** custom cover → latest save screenshot (shown at the game's native pixel resolution) → a generated colour tile.
- **Button hints** show keyboard keys until a controller is used, then switch to A/B/+/− glyphs.
- **In-game:** Esc / F1 / the controller's Home button opens the menu (Resume · Save to cloud · Save & quit · Quit without saving).

## Controls
| | Controller | Keyboard |
|---|---|---|
| Move | D-pad / left stick | Arrows |
| Select | A | Enter |
| Back | B | Esc / Backspace |
| Switch tab | L / R | Q / E |
| Game options | + | O |
| Menu | − / Home | F1 / M |
| In-game menu | Home | Esc / F1 |

The mouse and touch work everywhere too; hovering moves the console focus. In-game controls are EmulatorJS defaults (remappable in its menu), and a virtual gamepad appears on touch devices.

## Notes
- Only upload ROMs you dumped from cartridges you own. Keep the password to yourself; this is a private locker, not a share link.
- DS runs fine on desktop and is heavier on phones.

## In-game achievements
Every main-series game from Red to White 2 has its own achievement list (`lib/achievements.ts`): roughly 65–100 per game. They cover badges, the Pokédex, legendaries, team feats, money, play time, and a few secret ones. Pop-ups appear while you play, the game page has an Achievements tab, and points count towards your account level (5 XP per point).

How it reads the game (`public/ach-reader.js`): once a second it takes a save state and reads the console's RAM out of it. This is the same memory map RetroAchievements' MIT-licensed rcheevos uses: GBA IWRAM/EWRAM, Game Boy WRAM, DS main RAM. It then finds the game's data by structure rather than by fixed addresses, so no in-game save is needed:
- **Gen 1/2:** by the shape of the party list.
- **Gen 3:** by following the game's own save-data pointers (Emerald and FireRed/LeafGreen move that data on every map change).
- **Gen 4/5:** by the Pokédex block's magic number.

Every reading is checked for consistency and has to repeat before anything unlocks.

| Games | Status |
|---|---|
| FireRed / LeafGreen | confirmed on a real cartridge |
| Red / Blue / Yellow, Gold / Silver / Crystal, Ruby / Sapphire / Emerald, Diamond / Pearl / Platinum, HeartGold / SoulSilver, Black / White / Black 2 / White 2 | beta: tested with synthetic test cartridges only |
| Japanese Gen 1/2 | not supported (different memory layout) |

## Playthroughs: Nuzlocke, Soul Link, randomizer
Each game can have any number of playthroughs next to its main save (game page → **Playthroughs**). Every playthrough has its own cloud saves (`<game>-r-<run>`), so a Nuzlocke, a randomized run and your regular save never touch each other.

- **Normal:** just a separate save slot.
- **Nuzlocke:** tracked live from the same game-state reading the achievements use. The first Pokémon in each area counts; later catches there are flagged. A Pokémon at 0 HP is marked dead. Optional dupes clause, shiny clause and level caps (the next Gym Leader's ace). If an encounter fled or fainted, mark the area as used on the board.
- **Soul Link:** a Nuzlocke with up to 3 friends. They get an invite and join with their own copy of a game from the same region. Catches from the same area are linked; when one faints, its partner is marked dead too. Optional type clause.
- **Randomizer** (Game Boy / Game Boy Color / GBA): wild Pokémon (random, similar strength, or 1:1 swap), and for GBA games trainer teams and starters too. It runs in the browser before the game boots, from a seed, so every device and every Soul Link partner gets the same game without storing a second ROM. Tables are found by their structure; anything that can't be identified is left as it was. Randomized playthroughs don't earn achievements.

While playing, the playthrough chip (top right) opens the board: team, areas or links, graveyard and log.

Run data lives in `shared/runs/<id>/`: `meta.json` holds the settings and players, and each player writes only their own `p-<uid>.json`.
