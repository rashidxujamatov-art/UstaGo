# GTM — monorepo

Usta topish mobil ilovasi: `backend/` (NestJS 12 + Prisma 7 + PostgreSQL/PostGIS + Redis/BullMQ) va
`mobile/` (Expo SDK 57, expo-router). Qoidalar va arxitektura: `CLAUDE.md`, `docs/`.

## Talablar

- Node.js 24 LTS (`.nvmrc`), npm 11
- Docker Desktop (PostgreSQL + PostGIS, Redis, MinIO)

## Birinchi ishga tushirish

```bash
npm install
cp infra/.env.example infra/.env        # parollarni o‘zgartiring
cp backend/.env.example backend/.env    # infra/.env dagi parollar bilan bir xil
cp mobile/.env.example mobile/.env
docker compose -f infra/docker-compose.yml up -d
cd backend && npx prisma migrate dev && npm run db:seed && cd ..
npm run dev -w backend                  # API: http://localhost:4000/api/v1/health + worker
```

## Tekshiruvlar

```bash
npm test            # backend (Vitest) + mobile (Jest)
npm run lint        # backend: oxlint, mobile: expo lint
npm run typecheck
npm run format:check
```

## Mobil ilova

Expo Go ishlatilmaydi — development build kerak (`docs/02-arxitektura.md` §11):

```bash
npx eas-cli build --profile development --platform android   # yoki: npx expo run:android
npm run start -w mobile
```

`mobile/.env` dagi `APP_NAME`, `APP_DOMAIN`, `APP_BUNDLE_ID` — sozlama, kodga yozilmaydi.
`APP_BUNDLE_ID` birinchi relizdan keyin o‘zgarmaydi.

## Tuzilish

```
backend/   NestJS API (src/main.ts) va worker (src/worker.ts), prisma/ — sxema, migratsiyalar, seed
mobile/    Expo ilova: app/ — ekranlar (expo-router), src/ — theme, i18n, lib, api, store
infra/     docker-compose.yml va .env.example
legacy/    eski prototip (ishlatilmaydi)
```
