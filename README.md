# Basket Monster Web/PWA

Responsive Next.js shell for the Basket Monster public basketball app.

## Start

```powershell
cd C:\PT3\PR\Sportapp\basket\betmonster-basket-web
copy .env.example .env.local
npm install
npm run dev
```

API default:

```text
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8010
```

## Routes

- `/`
- `/basket/[date]`
- `/basket/wnba/[date]`
- `/basket/nbl1/[date]`
- `/match/[gameId]`
- `/live`
- `/signals`
- `/performance`
- `/alerts`
- `/settings`

## MVP Notes

- Uses the public read-only FastAPI.
- `status=live` relies on API live-like normalization.
- `league=NBL1` uses the grouped NBL1 filter.
- PWA shell includes manifest, service worker registration, offline page, mobile bottom nav, and stale/offline UI language.
