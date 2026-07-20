# Basket Monster Web/PWA

[![frontend-ci](https://github.com/vivalavita777-oss/betmonster-basket-web/actions/workflows/frontend-ci.yml/badge.svg)](https://github.com/vivalavita777-oss/betmonster-basket-web/actions/workflows/frontend-ci.yml)

Responsive Next.js shell for the Basket Monster public basketball app.

## Start

```powershell
cd C:\PT3\PR\Sportapp\basket\betmonster-basket-web
copy .env.example .env.local
pnpm install
pnpm dev
```

API default:

```text
BASKET_API_INTERNAL_URL=http://127.0.0.1:8010
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
