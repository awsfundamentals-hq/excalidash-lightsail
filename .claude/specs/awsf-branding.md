# AWS Fundamentals Draw: branding the ExcaliDash fork
> Created: 2026-10-12

We rebrand our ExcaliDash instance at `draw.awsfundamentals.com` as
"AWS Fundamentals Draw". It gets the full AWS Fundamentals look and a subtle
Lightsail badge. The app appears in a YouTube video about Lightsail, so it must
look polished and professional.

Two repos are involved:

- **Fork** `awsfundamentals-hq/ExcaliDash`: all UI changes and the image build.
- **This repo** `excalidash-lightsail`: deploys the image through the existing
  `frontendImage` context key. Only small README changes here.

## Decisions (settled, do not reopen)

| Area | Decision |
|---|---|
| License | ExcaliDash is LGPL-3.0. Rebrand allowed. Keep `LICENSE`, keep the fork public, keep a visible "Based on ExcaliDash" credit. No trademark rules upstream |
| Name | "AWS Fundamentals Draw" |
| Branch | One long-lived branch `awsf` in the fork. It carries library search (from `aws/library-search`) and the branding. Rebase onto each upstream release |
| Tags | `<upstream version>-awsf.<n>`, first one `0.6.5-awsf.1` |
| Image | `ghcr.io/awsfundamentals-hq/excalidash-frontend:<tag>`. Frontend only. Backend stays on the upstream image |
| Look | Full AWSF look: orange accent, slate surfaces, Cabinet Grotesk headings, Inter body, soft shadows |
| Theme | Dark by default. Light/dark toggle stays. Both themes get the AWSF palette |
| Display font | Cabinet Grotesk from the Fontshare CDN. No font files in the repo. CSP opens for Fontshare |
| Logo | AWSF cube monogram. Build an SVG version and compare with the WebP. Keep whichever looks better |
| Sidebar lockup | Logo, small "AWS Fundamentals" above a bold "Draw". Remove the "Beta" tag |
| Badge text | "Self-hosted on Lightsail for $8/month", fixed in code |
| Badge link | `https://github.com/awsfundamentals-hq/excalidash-lightsail` (private for now, public later) |
| Badge spots | Dashboard: pill above the sidebar footer. Editor: one line on the Excalidraw welcome screen, one item in the main menu. Not on login or other auth pages |
| Credit | Muted line "Based on ExcaliDash" under the sidebar pill, links to `https://github.com/ZimengXiong/ExcaliDash` |
| Editor | Excalidraw canvas stays stock. No accent recolor, no canvas background change |
| Auth pages | Get the AWSF name, logo, colors and fonts. No badge |

## Assumptions (confirmed by silence, change only if the user asks)

- Page title is "AWS Fundamentals Draw". In the editor: `<drawing name> – AWS Fundamentals Draw`.
- `localStorage` keys `excalidash-*` and the `.excalidash` file format stay. Renaming them breaks user state and backups.
- Backend strings stay upstream: the password reset email and the backup readme.
- The Settings update card keeps its link to upstream releases. `UPDATE_CHECK_OUTBOUND=false` already turns the check off.
- The `excalidashVersion` default in `lib/config.ts` stays. The AWSF image is set per deploy with `-c frontendImage=...`.

## Brand tokens

Source: `awsf-infra/apps/landing-awsfundamentals` (`tailwind.config.ts`, `src/styles/tailwind.css`, `src/pages/_document.tsx`).

| Token | Dark | Light |
|---|---|---|
| Accent | `#FF9900` | `#F49300` text on white for contrast, `#FF9900` fills |
| Accent hover | `#FFA51E` | `#BC7100` |
| Background | `#020617` (slate-950) | `#F8FAFC` (slate-50) |
| Card, popover | `#0F172A` (slate-900) | `#FFFFFF` |
| Border, input | `#1E293B` (slate-800) | `#E2E8F0` (slate-200) |
| Text | `hsl(214 32% 91%)` | `#0F172A` |
| Muted text | `hsl(215 20% 65%)` | `#64748B` |
| Radius | `0.5rem` base, `rounded-xl` on cards | same |
| Shadow | soft, e.g. `0 2px 6px rgb(15 23 42 / .08)` | same |

The accent callout style from the site: background `rgb(255 153 0 / .1)`, border `rgb(255 153 0 / .25)`.
Check WCAG AA for orange text on white. Use the darker brand shade if `#FF9900` fails.

Fonts: Inter for body (already bundled upstream). Cabinet Grotesk 500/700/800 for headings, from
`https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,700,800&display=swap`.

Logo sources in awsf-infra:

- `apps/landing-awsfundamentals/public/logos/logo-with-border.png` (250×250)
- `apps/landing-awsfundamentals/src/images/resources/AWS-fundamentals.webp` (navbar)
- Lightsail icon: `packages/aws-services/icons/lightsail.tsx` (inline SVG, reuse its paths)

## Fork changes (branch `awsf`)

Keep the diff small and in few files. Every change is a future rebase conflict.

### 1. Branch and workflow

1. Create `awsf` from `aws/library-search`. Its two commits come along: the Excalidraw upgrade and `.github/workflows/aws-frontend-image.yml`.
2. Change the workflow trigger from `*-libsearch.*` to `*-awsf.*`. Rename the workflow to "AWS Fundamentals Draw frontend image".
3. Keep `aws/library-search` until the first `awsf` image runs in production, then delete it.

### 2. Palette by remapping Tailwind colors

Upstream hardcodes about 139 `indigo-*`/`violet-*`/`purple-*` classes in 28 files and about 422 `neutral-*` classes for dark mode.
Do not edit those classes. Remap the palettes once in `frontend/tailwind.config.js`:

- `indigo` (and `violet`, `purple` if used as accent) → AWSF orange scale (`brand` 100–900 from the website).
- `neutral` → slate values, so dark surfaces become slate-950/900/800.
- `fontFamily.display` → Cabinet Grotesk.

Then set the CSS variables in `frontend/src/index.css:7-16`:

- `--excalidash-display-font`: `"Cabinet Grotesk", Inter, ui-sans-serif, ...`
- `--excalidash-brand`: `#FF9900`
- `--excalidash-ink`, `--excalidash-muted`: token values above
- `--excalidash-radius`: `0.5rem`
- `--excalidash-shadow`: the soft shadow. This removes the offset "hand-drawn" shadow.

Scan `.ui-card` and the other component classes from `index.css:50` on. Replace hard offset borders and shadows where they fight the soft look.

### 3. Font

- Add the Fontshare `<link>` to `frontend/index.html`, with `preconnect`.
- In `frontend/nginx.conf.template:53`, add `https://api.fontshare.com` to `style-src` and `https://cdn.fontshare.com` to `font-src`. Check the real hosts in the network tab. They must work before tagging.
- The dashboard UI no longer uses Excalifont. Drawings on the canvas keep it.

### 4. Name and title

| File | Change |
|---|---|
| `frontend/index.html:7` | `<title>AWS Fundamentals Draw</title>` |
| `frontend/src/pages/editor/useEditorChrome.ts:20,22` | `${drawingName} – AWS Fundamentals Draw` |
| `frontend/src/components/Sidebar.tsx:97-101` | Stacked lockup, remove "Beta" |
| `frontend/src/components/Layout.tsx:144` | Same lockup (mobile header) |
| `frontend/src/pages/AuthSetupChoice.tsx:137` | "Secure AWS Fundamentals Draw" |
| `frontend/src/pages/Profile.tsx:200` | Product name |
| `frontend/src/utils/importHelpers.ts:159` | Product name in the error message |

Put the name and URLs in one new module, e.g. `frontend/src/brand.ts`:
`APP_NAME`, `APP_NAME_SHORT` ("Draw"), `BRAND_NAME` ("AWS Fundamentals"), `BADGE_TEXT`, `BADGE_URL`, `UPSTREAM_URL`.
All files above import from it.

### 5. Logo and favicons

1. Build an SVG of the AWSF cube monogram from `logo-with-border.png`.
2. Render the SVG and the WebP side by side at 16, 32, 40 and 128 px, on dark and light backgrounds. Keep the better one. Show both to the user before committing.
3. Replace the inline SVG in `frontend/src/components/Logo.tsx`. Keep its props (`className`) so all eight call sites stay untouched.
4. Replace `frontend/public/favicon.svg`, `favicon-light.svg`, `favicon-dark.svg`. If the WebP wins, add PNG favicons and point `ThemeContext.tsx:24` at them.

### 6. Dark by default

`frontend/src/context/ThemeContext.tsx:19`: change the default from `"light"` to `"dark"`.
Users who already saved a preference keep it.
Check for a flash of light theme before React mounts. If it flashes, set `class="dark"` on `<html>` in `index.html` and let `ThemeContext` remove it.

### 7. Lightsail badge and credit

New component `frontend/src/components/LightsailBadge.tsx`:

- Small pill: Lightsail icon (from awsf-infra), text `BADGE_TEXT`, links to `BADGE_URL` in a new tab with `rel="noopener noreferrer"`.
- Style: the site's accent callout (orange at 10% fill, 25% border), `rounded-full`, `text-xs`. Subtle, never louder than the nav.
- Below it, a muted `text-[11px]` line "Based on ExcaliDash" that links to `UPSTREAM_URL`.

Placement:

- **Dashboard:** in `Sidebar.tsx`, right above `<SidebarFooter>`. All dashboard pages use this sidebar. Check the mobile drawer too.
- **Editor welcome screen:** in `frontend/src/pages/editor/EditorView.tsx`, add an Excalidraw `<WelcomeScreen>` child. Keep the default hints. Add the logo, "AWS Fundamentals Draw" and one badge line. No recolor of Excalidraw itself.
- **Editor main menu:** add one `MainMenu.ItemLink` with the Lightsail icon and `BADGE_TEXT` to the custom `<MainMenu>` (`EditorView.tsx:330-345`).
- **Not** on `Login.tsx`, `Register.tsx`, `AuthSetupChoice.tsx`, password reset pages.

### 8. License hygiene

- Keep `LICENSE` unchanged.
- Add a short "AWS Fundamentals fork" section on top of the fork `README.md`: what changed, the branch, the image, the tag scheme, and that the original is ExcaliDash by Zimeng Xiong under LGPL-3.0.

## This repo changes

- `README.md`:
  - The "Patched frontend image" section points at `0.6.5-awsf.1` and the `awsf` branch.
  - "Credits": mention the AWS Fundamentals Draw fork and the LGPL source location.
- No CDK code changes. `frontendImage` exists already.

## Release

1. Push `awsf`, tag `0.6.5-awsf.1`, push the tag. The workflow builds and pushes the image.
2. Make the GHCR package public if it is not, so the instance can pull without credentials.
3. On the instance: `sudo /opt/excalidash/bin/update.sh 0.6.5 ghcr.io/awsfundamentals-hq/excalidash-frontend:0.6.5-awsf.1`.
4. Next CDK deploy passes `-c frontendImage=ghcr.io/awsfundamentals-hq/excalidash-frontend:0.6.5-awsf.1`.

Production update and deploy need the user's go. They change the live instance.

## Upstream updates

1. `git fetch upstream`, `git rebase upstream/<release tag>` on `awsf`.
2. Conflicts land mostly in `tailwind.config.js`, `index.css`, `Sidebar.tsx`, `EditorView.tsx`, `Logo.tsx`.
3. After the rebase, grep for new `ExcaliDash` strings and new accent colors outside the remapped palettes.
4. Tag `<new version>-awsf.1`, run `update.sh` with both versions.

## Verification

Run the fork locally with Docker Compose (upstream backend image plus the locally built frontend).
For each page, take a screenshot in dark and light, at desktop and 375 px width:

- Login, register, auth setup choice, password reset
- Dashboard with drawings, empty dashboard, collection view, trash, settings, admin, profile
- Editor: empty canvas (welcome screen), main menu open, a drawing with content

Check:

- No "ExcaliDash" visible except the credit line, the Settings releases link, and file-format names.
- No indigo or violet left. Grep the built CSS for the old indigo hex values.
- Cabinet Grotesk loads (network tab, no CSP errors in the console).
- First load is dark. The toggle works and persists.
- Badge appears on every dashboard page and in the editor, and nowhere on auth pages.
- Favicon is sharp at 16 px in both themes.
- Orange text passes WCAG AA contrast in light mode.
- Library search still works.

The agent runs these checks itself before tagging, then shows the user the screenshots.

## Out of scope

- Backend image, emails, backup readme
- Excalidraw canvas theming
- Renaming storage keys or file formats
- Making `excalidash-lightsail` public
- Analytics or any outbound calls besides Fontshare
