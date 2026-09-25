# GTM (Get the money) — Claude Code uchun loyiha qo‘llanmasi

GTM — O‘zbekiston uchun usta topish mobil ilovasi. Buyurtmachi ish joylaydi, bajaruvchi (usta) ishni qabul qiladi, bajaradi va pul oladi. Bitta ilovada 4 ta rol bor: super admin, admin, buyurtmachi, bajaruvchi.

## Ilova nomi

- Hozirgi nomi **GTM**, to‘liq nomi **GTM — Get the money**. Bu ishchi nom: domen va tovar belgisi tekshirilgach o‘zgarishi mumkin. Oldingi nom (UstaGo) kodda, matnlarda va identifikatorlarda ishlatilmaydi. Loyiha papkasi `D:\UstaGo` nomi bilan qoldi.
- Nomni kodga qattiq yozmang. U bitta joyda turadi: `APP_NAME` sozlamasi (mobil `app.config.ts`, backend `.env`). Tarjima matnlarida nom `{appName}` o‘zgaruvchisi bilan qo‘yiladi. Nom o‘zgarsa, faqat shu sozlama, ilova belgisi (icon, splash) va do‘kon sahifasi yangilanadi.
- Brend nomi tarjima qilinmaydi: `uz`, `ru`, `en`, `tg` matnlarida bir xil yoziladi.
- Domen, iOS bundle ID va Android applicationId hali tanlanmagan. Ularni ham kodga yozmang: `APP_DOMAIN` va `APP_BUNDLE_ID` sozlamalaridan oling (`.env`, `app.config.ts`). Ochiq savol: `docs/01-biznes-qoidalar.md` §13.
- Bundle ID va applicationId ilova do‘konga birinchi marta chiqqandan keyin o‘zgartirib bo‘lmaydi. Shuning uchun ularni nomga bog‘lamang va birinchi relizdan oldin yakuniy qiymatni tanlang. Ilovaning ko‘rinadigan nomini esa keyin ham almashtirish mumkin.
- Logotip va yozuv o‘lchamlari: `docs/03-ekranlar-va-dizayn.md` §2.4.

## Avval shularni o‘qing

1. `docs/01-biznes-qoidalar.md` — biznes qoidalar. **Yagona haqiqat manbai.** Kod shu hujjatga zid bo‘lsa, hujjat to‘g‘ri hisoblanadi. Qoida noaniq bo‘lsa — kod yozmasdan to‘xtang va so‘rang.
2. `docs/02-arxitektura.md` — texnologiyalar, modullar, ma’lumotlar bazasi, API, integratsiyalar, ish bosqichlari.
3. `docs/03-ekranlar-va-dizayn.md` — 44 ta ekran ro‘yxati, dizayn tokenlari (ranglar, shrift, o‘lchamlar).
4. `Fronted rasmlar/` — dizayn kanvasidan eksport qilingan ekran rasmlari (PNG). UI’ni shu rasmlarga qarab quring.

## Texnologiyalar (qisqa)

- Hamma joyda **TypeScript**.
- Mobil: **React Native + Expo** (`mobile/`), Android va iOS. Expo Go emas — development build (EAS).
- Backend: **Node.js LTS + NestJS** (`backend/`), **PostgreSQL + PostGIS**, **Prisma**, **Redis**, **BullMQ**, **Socket.IO**.
- Xarita: **Google Maps** (`react-native-maps`, Google provider). Yandex ishlatilmaydi.
- To‘lov: Click va Payme (merchant API), naqd pul. SMS: Eskiz.uz. Shaxsni tasdiqlash: MyID.
- Batafsil ma’lumot: `docs/02-arxitektura.md`.

## Hujjat va kod tili

- Hujjatlar o‘zbek tilida. Kod, identifikatorlar, izohlar, commit xabarlari ingliz tilida.
- Foydalanuvchiga ko‘rinadigan har bir matn 4 tilda bo‘ladi: `uz` (lotin), `ru`, `en`, `tg`. Matnni kodga yozmang — faqat tarjima kalitlari (i18n) ishlatilsin.
- Backend foydalanuvchiga matn qaytarmaydi, faqat xato kodi va parametrlar qaytaradi: `{ "code": "WALLET_INSUFFICIENT_TO_ACCEPT", "params": { "shortfall": "1550000" } }` (pul — tiyinda, satr ko‘rinishida). Matnni mobil ilova tanlangan tilda ko‘rsatadi.

## Qat’iy qoidalar (buzilmasin)

1. **Pul faqat butun son**: `BIGINT`, tiyinda (1 so‘m = 100 tiyin). `float`, `double`, JS `number` bilan pul hisoblash taqiqlanadi (TypeScript’da `bigint` yoki butun sonli Money yordamchisi). Foizlar bps’da saqlanadi (1 bps = 0.01%): 2.5% = 250.
2. Har qanday pul harakati faqat **ledger** orqali (double-entry): har bir tranzaksiyada yozuvlar yig‘indisi 0 bo‘ladi. Balansni to‘g‘ridan-to‘g‘ri o‘zgartirish taqiqlanadi.
3. Hamyon amallari bitta DB tranzaksiyasi ichida, `SELECT … FOR UPDATE` bilan bajariladi. Har bir amalda `idempotency_key` bo‘ladi (qayta kelgan so‘rov ikki marta pul o‘tkazmaydi).
4. To‘lov callback’lari **har doim** tekshiriladi (Click — imzo, Payme — Basic auth), muhitdan qat’i nazar. Foydalanuvchi yoki buyurtma topilmasa, xato qaytariladi. Hech qachon "birinchi foydalanuvchi"ga yozilmaydi.
5. Sirlar (kalitlar, parollar) faqat `.env`da turadi. Kodda default sir bo‘lmaydi. `.env` gitga tushmaydi, `docker-compose.yml`ga ham yozilmaydi.
6. Test OTP kodlari faqat `NODE_ENV=development` va `OTP_TEST_MODE=true` bo‘lganda ishlaydi.
7. Stavkalar, limitlar va muddatlar kodga yozilmaydi. Ular `settings` jadvalidan o‘qiladi va super admin o‘zgartiradi. Standart qiymatlar: `docs/01-biznes-qoidalar.md` §12. Buyurtma qabul qilinganda stavkalar buyurtmaga nusxalanadi (snapshot).
8. Ilova ichida burilishma-burilish navigatsiya qilinmaydi (Google shartlari). Yo‘l Google Maps ilovasida ochiladi.
9. Yuz rasmi saqlanmaydi, uni MyID tekshiradi. PINFL shifrlangan holda va HMAC xesh bilan saqlanadi (xesh — takrorlanishni tekshirish uchun).
10. Admin va super admin amallari, shuningdek har bir pul amali `audit_logs`ga yoziladi.
11. Ruxsat backend’da tekshiriladi (guard). Mobil ilovada tugmani yashirish — xavfsizlik emas.
12. Naqd va Xolis to‘lovi faqat ikki tomon tasdig‘i bilan yopiladi: buyurtmachi "To‘ladim", usta "Pulni qabul qildim". Xizmat haqi usta tasdiqlaganda avtomatik yechiladi. Tasdiqlamagan tomonni backend bloklaydi: buyurtmachi yangi buyurtma joylay olmaydi, usta yangi ish ololmaydi (`docs/01-biznes-qoidalar.md` §5.1).

## Mavjud kod haqida

Eski prototip (Express + JSON fayl backend, Expo SDK 51 JavaScript ilova va web versiya) 0-bosqichda `legacy/`ga ko‘chirildi va yangi kodga ulanmagan. Ulardan g‘oya sifatida foydalaning, lekin quyidagi xatolarni yangi kodga ko‘chirmang:

- `legacy/backend/controllers/authController.js`: `7777` va `1234` kodlari har doim o‘tadi; JWT uchun default sir bor; OTP xotirada (`Map`) saqlanadi; kod 4 xonali (kerak: 6 xonali).
- `legacy/backend/services/paymeMerchant.js`: Basic auth tekshirilmaydi; foydalanuvchi topilmasa `db.users[0]`ga pul yoziladi; pul `float`da.
- `legacy/backend/services/clickMerchant.js`: imzo faqat production’da va `sign_string` kelgandagina tekshiriladi; noma’lum foydalanuvchi bo‘lsa `db.users[0]` ishlatiladi.
- `legacy/backend/services/eskizSms.js`: Eskiz’ga kirish xato bo‘lsa, "demo token" bilan jimgina davom etadi.
- 10 000 so‘mlik "starter bonus" hammaga beriladi — noto‘g‘ri. Qoida: faqat ustaga, 25 000 so‘m demo, PINFL bo‘yicha bir marta.
- `offers` (taklif, savdolashish) modeli talablarda yo‘q. Narxni buyurtmachi qo‘yadi, usta qabul qiladi.
- `legacy/mobile/src/theme/colors.js` ranglari dizaynga mos emas — `docs/03-ekranlar-va-dizayn.md`dagi tokenlar ishlatilsin.
- `legacy/` ildizidagi `index.html`, `app.js`, `styles.css`, `server.js`, `server.py`, `db.js`, `database.json`, `vercel.json` — eski web prototip, ishlatilmaydi.

## Ish tartibi

- Ish bosqichlari: `docs/02-arxitektura.md` §13. Har bir bosqich alohida branch va PR bo‘ladi.
- Har bir pul formulasi uchun unit test yoziladi. `docs/01-biznes-qoidalar.md` §11dagi test holatlari **albatta** o‘tishi kerak.
- Tashqi xizmatlar (MyID, Click, Payme, Eskiz, Google, FCM, payout) adapter orqali ulanadi. Lokal muhitda va testda `mock` adapterlar ishlaydi.
- Biznes qoidani o‘zgartiradigan qaror kerak bo‘lsa, kod yozishdan oldin so‘rang. Ochiq savollar va vaqtinchalik standart javoblar: `docs/01-biznes-qoidalar.md` §13.
- Real pul bilan ishga tushirishdan oldin §14dagi yuridik talablar hal qilinishi kerak. Ungacha pul yechish (payout) feature flag ortida turadi.

## Buyruqlar (loyiha sozlangandan keyin)

- `docker compose -f infra/docker-compose.yml up -d` — PostgreSQL, Redis, MinIO
- `npm run dev -w backend` — API (http://localhost:4000) va worker
- `npm run start -w mobile` — Expo development build
- `npm test -w backend` — testlar
- `npx prisma migrate dev` (`backend/` ichida) — migratsiyalar
- `npm run db:seed -w backend` — sozlamalar seed’i (§12 standart qiymatlari, mavjudlarini o‘zgartirmaydi)
- `npm run lint`, `npm run typecheck` — ikkala workspace uchun
- `npm run test:e2e -w backend` — e2e testlar (`E2E_DATABASE_URL`, `E2E_REDIS_URL` kerak; jadvallarni tozalaydi — faqat test bazasida)
- `npm run cli -w backend -- invite-code:create --max-uses 10` — platforma taklif kodi; `super-admin:grant --phone +998...` — super admin (odam avval ro‘yxatdan o‘tib, MyID’dan o‘tgan bo‘lishi kerak)
