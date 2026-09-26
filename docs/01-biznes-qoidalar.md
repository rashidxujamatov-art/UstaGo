# GTM (Get the money) — biznes qoidalar

Bu hujjat — yagona haqiqat manbai. Hamma summalar so‘mda yozilgan, kodda esa tiyinda saqlanadi (1 so‘m = 100 tiyin). API’dagi pul maydonlari ham tiyinda bo‘ladi.

## 0. Atamalar

| Atama | Kodda | Ma’nosi |
|---|---|---|
| Buyurtmachi | `CUSTOMER` | Ish joylaydi va to‘laydi |
| Bajaruvchi, usta | `EXECUTOR` | Ishni qabul qiladi va bajaradi |
| Admin | `ADMIN` | Super admin bergan ruxsatlar bilan ishlaydi |
| Super admin | `SUPER_ADMIN` | Hamma narsani boshqaradi |
| Xizmat haqi | `fee` | Har bir ishdan platforma oladigan 2.5% |
| Demo bonus | `DEMO` | Ustaga bir marta beriladigan 25 000 so‘m. Yechib bo‘lmaydi |
| Bepul davr | `free period` | Ustaning birinchi 30 kuni, hujjat so‘ralmaydi |
| Band qilish | `hold` | Qabul qilingan ish uchun xizmat haqi summasini hisobda "muzlatish" |
| To‘lov tasdig‘i | `customer_paid_at`, `executor_received_at` | Naqd va Xolis’da: buyurtmachi "To‘ladim", usta "Pulni qabul qildim" (§5.1) |
| Platforma kodi | `invite_codes` | Super admin yaratadigan taklif kodi; bu kod bilan kelganning L1’i bo‘lmaydi (§2) |
| Referal L1 / L2 | `ref_l1`, `ref_l2` | Ustani taklif qilgan odam (L1) va uni taklif qilgan odam (L2) |
| JShShIR | `pinfl` | Shaxsning 14 xonali identifikatsiya raqami |
| bps | — | Foizning yuzdan biri: 1 bps = 0.01%, 2.5% = 250 bps |

## 1. Rollar va ruxsatlar

- Har bir ro‘yxatdan o‘tgan foydalanuvchida ikkala rol bor: `CUSTOMER` va `EXECUTOR`. Bir vaqtda bittasi faol (`active_role`).
- Rol ro‘yxatdan o‘tishning oxirida tanlanadi (K4 ekrani). Keyin bosh menyuda almashtiriladi (U1 ekrani).
- Ro‘yxatdan o‘tishda admin va super admin rollari ko‘rinmaydi.
- `ADMIN` rolini faqat super admin beradi (SA3 ekrani). Ruxsatlar alohida yoqiladi:

| Ruxsat | Kodda | Nima qila oladi |
|---|---|---|
| Buyurtmalar | `orders.moderate` | Ko‘rish, moderatsiya, bekor qilish |
| Foydalanuvchilar | `users.manage` | Hujjat murojaatlarini ko‘rish (MyID, soliq), bloklash |
| Shikoyat va nizolar | `disputes.resolve` | Qaror chiqarish (pul qaytarishsiz) |
| Kategoriyalar | `categories.manage` | Xizmat turlarini qo‘shish va tahrirlash |
| Moliya hisobotlari | `finance.view` | Faqat ko‘rish |
| Bildirishnoma | `notifications.broadcast` | Barcha foydalanuvchilarga xabar yuborish |

- Faqat `SUPER_ADMIN` qila oladi: komissiya va foizlarni o‘zgartirish, soliq usullarini yoqish/o‘chirish, pul qaytarish (refund), sozlamalar, adminlarni tayinlash, xarita sozlamalari.
- Super admin ilova orqali yaratilmaydi, faqat serverdagi CLI buyrug‘i orqali (telefon raqami buyruqqa parametr sifatida beriladi, kodda va seed’da saqlanmaydi). Har bir yaratish `audit_logs`ga yoziladi.
- Bloklangan foydalanuvchi tizimga kira oladi, lekin buyurtma joylay olmaydi va ish qabul qila olmaydi. Hamyondagi pulini yechishi mumkin (agar nizo bo‘lmasa).

## 2. Ro‘yxatdan o‘tish va kirish

Ketma-ketlik (ekranlar: Main → K2 → K3 → K3b → K3c → K3d → K4):

1. **Til va ko‘rinish** (Main): `uz`, `ru`, `en`, `tg`; kunduzgi / tungi / avto rejim.
2. **Ro‘yxatdan o‘tish** (K2):
   - telefon: `+998 XX XXX XX XX`, unique;
   - elektron pochta: unique;
   - parol: kamida 8 belgi, kamida bitta harf va bitta raqam (K2);
   - referal kod majburiy (tasdiqlangan): havoladan avtomatik olinadi (`https://{APP_DOMAIN}/r/{CODE}`) yoki qo‘lda kiritiladi. Kodsiz ro‘yxatdan o‘tib bo‘lmaydi: `AUTH_REFERRAL_REQUIRED`. Ekranda "Sizni {ism} taklif qildi" deb ko‘rsatiladi.
   - birinchi foydalanuvchilar va reklama uchun super admin platforma kodlarini yaratadi (`invite_codes`). Bunday kod bilan kelgan odamning L1’i bo‘lmaydi, bonus hech kimga yozilmaydi.
   - qoida hozircha hammaga tegishli: buyurtmachiga ham, ustaga ham (§13, 2-savol).
3. **SMS kod** (K3): 6 xonali, 5 daqiqa amal qiladi, qayta yuborish 60 soniyadan keyin, ko‘pi bilan 5 urinish. Telefon raqami va IP bo‘yicha cheklov qo‘yiladi.
4. **MyID** (K3b, K3c): hujjat turi (ID-karta yoki pasport), seriya va raqam, tug‘ilgan sana, rozilik belgisi (majburiy), yuz tekshiruvi. MyID’dan olinadi: PINFL, F.I.Sh., tug‘ilgan sana.
   - MyID hamma uchun majburiy: buyurtmachi uchun ham, usta uchun ham.
   - Qarindoshlarning ma’lumotlari so‘ralmaydi.
   - Yuz rasmi GTM bazasida saqlanmaydi.
5. **Takroriy shaxs** (K3d): bitta PINFL = bitta hisob. PINFL bazada bor bo‘lsa, yangi hisob ochilmaydi va "Mavjud hisobga kirish" taklif qilinadi. Pasport almashsa ham PINFL o‘zgarmaydi, shuning uchun bepul davr qayta berilmaydi.
6. **Rol tanlash** (K4): `CUSTOMER` yoki `EXECUTOR`.

Kirish:

- Telefon + parol. Yangi qurilmada qo‘shimcha ravishda SMS kod so‘raladi.
- Parolni tiklash SMS kod orqali bo‘ladi.
- Sessiya: access token 15 daqiqa, refresh token 30 kun (har ishlatilganda yangilanadi). Foydalanuvchi qurilmalar ro‘yxatini ko‘ra oladi va ulardan chiqa oladi.

## 3. Buyurtma hayot sikli

### 3.1. Buyurtma maydonlari

- Kategoriya, nomi, tavsif, rasmlar (5 tagacha).
- Manzil: xaritadagi belgi (lat, lng), manzil matni (Google geocoding), podyezd, qavat, xonadon, mo‘ljal (ixtiyoriy).
- Vaqt oralig‘i (masalan, "Bugun, 10:30 – 13:00").
- Narx (so‘mda). Narxni buyurtmachi qo‘yadi, savdolashish yo‘q.
- To‘lov usuli: `BALANCE`, `CLICK`, `PAYME`, `CARD`, `CASH` (§5). Buyurtma joylanganda tanlanadi va keyin o‘zgarmaydi: to‘lov faqat shu usulda qilinadi (BY5, BJ4).
- Buyurtma raqami — ketma-ket, odam uchun qulay (`#1024`). Ichki ID — UUID.

### 3.2. Holatlar

| Holat | Ma’nosi |
|---|---|
| `PUBLISHED` | Joylandi, ustalar ko‘radi |
| `ACCEPTED` | Usta qabul qildi, xizmat haqi band qilindi |
| `EN_ROUTE` | Usta "Yo‘lga chiqdim"ni bosdi, jonli joylashuv yoqildi |
| `ARRIVED` | Usta yetib keldi |
| `IN_PROGRESS` | Ish boshlandi |
| `DONE_BY_EXECUTOR` | Usta "Ishni tugatdim"ni bosdi. To‘lov bosqichi faqat shundan keyin ochiladi |
| `COMPLETED` | Buyurtmachi ishni qabul qildi. Naqd va Xolis’da — pulni berib, "To‘ladim"ni bosdi |
| `PAID` | To‘lov tasdiqlandi va hisob-kitob bajarildi: online’da — callback keldi, naqd va Xolis’da — usta "Pulni qabul qildim"ni bosdi. Yakuniy holat |
| `CANCELLED` | Bekor qilindi (kim bekor qilgani va sababi saqlanadi) |
| `DISPUTED` | Shikoyat ochildi, hisob-kitob to‘xtatildi |

### 3.3. O‘tishlar

| Qayerdan → qayerga | Kim | Shart va natija |
|---|---|---|
| `PUBLISHED → ACCEPTED` | usta | §4dagi hamma shartlar bajarilsa. Birinchi qabul qilgan usta oladi (atomik amal) |
| `PUBLISHED → CANCELLED` | buyurtmachi, admin | Istalgan vaqtda |
| `PUBLISHED → CANCELLED` | tizim | Vaqt oralig‘i (`time_to`) tugagan va hech kim olmagan buyurtma avtomatik bekor bo‘ladi (sabab `EXPIRED`), buyurtmachiga xabar boriladi |
| `ACCEPTED → EN_ROUTE` | usta | "Yo‘lga chiqdim". Jonli joylashuv boshlanadi (§10) |
| `ACCEPTED / EN_ROUTE → PUBLISHED` | usta | Usta voz kechsa, buyurtma qayta ochiladi, band qilingan summa qaytariladi |
| `ACCEPTED / EN_ROUTE → CANCELLED` | buyurtmachi | Sabab bilan (ro‘yxatdan: usta endi kerak emas; boshqa usta topdim; usta kechikyapti yoki javob bermayapti; narx yoki shartlarda kelisha olmadik; boshqa sabab — matn bilan). Band qilingan summa qaytariladi |
| `EN_ROUTE → ARRIVED` | usta yoki avtomatik | "Yetib keldim" tugmasi yoki manzilga 50 m qolganda |
| `ARRIVED → IN_PROGRESS` | usta | "Ishni boshladim" |
| `IN_PROGRESS → DONE_BY_EXECUTOR` | usta | "Ishni tugatdim". Usta pulni faqat shundan keyin oladi: QR (BJ4) va "To‘ladim" shu holatdan ochiladi |
| `DONE_BY_EXECUTOR → COMPLETED` | buyurtmachi | Online: "Qabul qilish va to‘lash" (BY3 → BY5 yoki QR). Naqd va Xolis: pulni beradi va "To‘ladim"ni bosadi (BY9, §5.1) |
| `COMPLETED → PAID` | tizim yoki usta | Online: to‘lov callback’i. Naqd va Xolis: usta "Pulni qabul qildim"ni bosadi (BJ13) — xizmat haqi avtomatik yechiladi. §5 bo‘yicha hisob-kitob |
| `DONE_BY_EXECUTOR → PAID` | usta | Naqd va Xolis: buyurtmachi "To‘ladim"ni bosmagan bo‘lsa ham, pulni olgan usta "Pulni qabul qildim"ni bosa oladi |
| `DONE_BY_EXECUTOR / COMPLETED → DISPUTED` | buyurtmachi yoki usta | "Shikoyat" tugmasi. Naqd va Xolis’da: usta — "Pul kelmadi", buyurtmachi — "Muammo bor" |
| `DISPUTED → PAID / CANCELLED` | admin | Qaror: ustaga to‘liq to‘lash, qisman (50%) to‘lash yoki bekor qilish. Nizo davomida online to‘lov platformada ushlab turiladi (tasdiqlangan). Pul qaytarishni faqat super admin tasdiqlaydi (AD3 ekrani) |

Har bir o‘tish `order_events` jadvaliga yoziladi: kim, qachon, oldingi holat, keyingi holat.

### 3.4. Kim nimani ko‘radi

- Qabul qilishdan oldin usta ko‘radi: kategoriya, nomi, tavsif, rasmlar, narx, to‘lov usuli, vaqt, to‘liq manzil (xaritadagi joy, manzil matni, podyezd, qavat, xonadon, mo‘ljal), taxminiy masofa (0.1 km aniqlikda), buyurtmachining ismi va reytingi. Manzil oldindan ko‘rinadi — tasdiqlangan.
- Buyurtmachining telefon raqami faqat qabul qilgandan keyin ochiladi.
- Buyurtmachi manzil kiritayotganda unga "Manzilingiz e’londa ustalarga ko‘rinadi" deb aytiladi (BY6).
- Buyurtmachi va usta chati (BY4) faqat buyurtma qabul qilingandan keyin ochiladi.

## 4. Ishni qabul qilish sharti va band qilish

- `required = CEIL(price × accept_threshold_bps / 10 000)`. Qiymati 250 bps (2.5%) — **tasdiqlangan** (3% emas).
- `available = real + demo_active − Σ faol_hold`
- `available < required` bo‘lsa, qabul qilinmaydi va `WALLET_INSUFFICIENT_TO_ACCEPT` xatosi qaytadi. Parametr: `shortfall = required − available`. Xabar: "Bu ishni olish uchun yana {shortfall} so‘m to‘ldiring — shundan keyin ishni olasiz." (BJ3 ekrani)
- Buyurtmalar ro‘yxati hammaga ko‘rinadi. Balans faqat "Qabul qilish" tugmasi bosilganda tekshiriladi.
- Har bir olingan ishdan 2.5% olinadi (tasdiqlangan). Qabul qilinganda xizmat haqi oldindan hisoblanadi: `fee`, `fee_demo`, `fee_real` (§6) buyurtmaga yoziladi va shu summaga hold yaratiladi. Bir nechta faol ish bo‘lsa, har biriga alohida hold bo‘ladi.
- Hold hisob-kitobda (settlement), bekor qilishda yoki nizo hal bo‘lganda yopiladi.
- Bepul davr ish o‘rtasida tugasa, qabul qilingandagi hisob-kitob o‘zgarmaydi: band qilingan demo yonmaydi va ish shu shartlar bilan yakunlanadi (tasdiqlangan).
- Bepul davr tugagach, yangi ish qabul qilish uchun soliq usuli tasdiqlangan bo‘lishi kerak: `tax_status = VERIFIED` (§9).
- Qo‘shimcha shartlar: faol rol `EXECUTOR`, MyID tasdiqlangan, bloklanmagan, buyurtma o‘ziniki emas, "Pulni qabul qildim"ni kutayotgan naqd yoki Xolis ishi yo‘q (§5.1).

## 5. To‘lov usullari va hisob-kitob (settlement)

| Usul | Kodda | Pul qayerga tushadi |
|---|---|---|
| Hisobdan hisobga | `BALANCE` | Buyurtmachining GTM hisobidan ustaning hisobiga |
| Click QR / havola | `CLICK` | GTM’ning Click merchant hisobiga, keyin ustaning hisobiga |
| Payme QR / havola | `PAYME` | GTM’ning Payme merchant hisobiga, keyin ustaning hisobiga |
| Karta (Uzcard, Humo, Visa, Mastercard) | `CARD` | Click yoki Payme karta API orqali, `CLICK`/`PAYME` kabi |
| Naqd | `CASH` | To‘g‘ridan-to‘g‘ri ustaga. GTM’dan o‘tmaydi |
| Paynet Xolis QR | `XOLIS_QR` | To‘g‘ridan-to‘g‘ri ustaning Xolis hamyoniga. GTM’dan o‘tmaydi. Faqat usta Xolis usulida bo‘lsa, to‘lov vaqtida taklif qilinadi |

QR orqali to‘lov (BJ4 ekrani): usta "Ishni tugatdim"dan keyin "To‘lovni qabul qilish"ni ochadi. Ilova GTM merchant havolasini (buyurtma raqami va summa bilan) QR ko‘rinishida chiqaradi. QR 5 daqiqa amal qiladi. Buyurtmachi QR’ni Click yoki Payme ilovasi bilan skanerlaydi. Callback kelgach buyurtma `PAID` bo‘ladi va ikkala ilova WebSocket orqali yangilanadi.

`PAID` bo‘lganda hisob-kitob (bitta DB tranzaksiyasida):

1. Online usullarda (`BALANCE`, `CLICK`, `PAYME`, `CARD`): ustaning `REAL` hisobiga `price` yoziladi.
   - `BALANCE` bo‘lsa, buyurtmachining `REAL` hisobidan `price` yechiladi. Yetmasa: `WALLET_INSUFFICIENT_FUNDS`.
   - Click yoki Payme summasi `price`ga aniq teng bo‘lishi shart, aks holda to‘lov rad etiladi.
2. `CASH` va `XOLIS_QR` bo‘lsa, pul GTM’dan o‘tmaydi. Hisob-kitob usta "Pulni qabul qildim"ni bosganda bajariladi (§5.1): faqat 3- va 4-qadamlar.
3. Xizmat haqini yechish: hold yopiladi, qabul qilinganda hisoblangan `fee_demo` demo hisobidan, `fee_real` real hisobdan yechiladi (§4, §6).
4. Referal va platforma ulushi §6 bo‘yicha taqsimlanadi.

Holdlar tufayli ustaning `REAL` hisobi manfiy bo‘lmasligi kerak. Agar shunday bo‘lib qolsa (masalan, nizodan keyin), qarz sifatida yoziladi va hisob to‘ldirilmaguncha usta yangi ish ololmaydi.

### 5.1. Naqd va Xolis to‘lovini tasdiqlash (tasdiqlangan)

`CASH` va `XOLIS_QR`da pul GTM’dan o‘tmaydi, shuning uchun to‘lovni ikkala tomon ilovada tasdiqlaydi (ekranlar: BY9, BY10, BJ13, BJ14):

1. Usta "Ishni tugatdim"ni bosadi → `DONE_BY_EXECUTOR`.
2. Buyurtmachi buyurtma narxini (summa o‘zgarmaydi) naqd beradi yoki ustaning Xolis QR-kodiga to‘laydi va "To‘ladim"ni bosadi (BY9) → `COMPLETED`.
3. Usta "Pulni qabul qildim"ni bosadi (BJ13) → `PAID`. Xizmat haqi 2.5% usta hisobidan avtomatik yechiladi, referal §6 bo‘yicha taqsimlanadi. Ustaga xabar: "Xizmat haqi {fee} so‘m hisobingizdan yechildi".

Tasdiqlamaslik oqibati:

- Buyurtmachi "To‘ladim"ni bosmaguncha yangi buyurtma joylay olmaydi (BY10). Xato: `ORDER_CUSTOMER_CONFIRMATION_REQUIRED`, parametr — buyurtma raqami. Online usulda to‘lanmay qolgan (`DONE_BY_EXECUTOR`dagi) buyurtma ham yangi buyurtmani shunday to‘xtatadi.
- Usta naqd yoki Xolis ishida "Ishni tugatdim"dan keyin "Pulni qabul qildim"ni bosmaguncha yangi ish ololmaydi (BJ14). Xato: `ORDER_EXECUTOR_CONFIRMATION_REQUIRED`.
- Pulni olgan usta buyurtmachi "To‘ladim"ni bosmagan bo‘lsa ham "Pulni qabul qildim"ni bosa oladi. Buyurtma yopiladi, buyurtmachining cheklovi ham olinadi.
- Pul kelmagan bo‘lsa, usta "Pul kelmadi"ni bosadi → `DISPUTED`, admin hal qiladi. Buyurtmachi ham "Muammo bor" orqali nizo ochishi mumkin. Nizo ochilgach, ikkala tomonning shu buyurtma bo‘yicha cheklovi olinadi.
- Eslatmalar: tasdiqlamagan tomonga 2 va 24 soatdan keyin push, 48 soatdan keyin adminga vazifa. Avtomatik to‘lov ham, avtomatik tasdiq ham yo‘q.
- Soliq: Xolis QR orqali to‘lansa 1% ni Xolis to‘laydi; naqd to‘lansa soliq uchun usta o‘zi javobgar. GTM soliq ushlamaydi.

## 6. Formulalar: xizmat haqi, referal, platforma

Hamma natija butun so‘mga yaxlitlanadi, tiyinda saqlanadi.

```
fee           = ROUND_HALF_UP(price × fee_bps / 10 000)       # 250 bps = 2.5%
fee_demo      = MIN(demo_available, fee)                      # qabul qilinganda, avval demo
fee_real      = fee − fee_demo
ref_l1        = FLOOR(fee × ref_l1_bps / fee_bps)             # to‘liq fee’dan: narxning 0.25%
ref_l2        = FLOOR(fee × ref_l2_bps / fee_bps)             # narxning 0.12%
ref_l1_real   = FLOOR(fee_real × ref_l1_bps / fee_bps)        # real xizmat haqidan to‘lanadigan qism
ref_l2_real   = FLOOR(fee_real × ref_l2_bps / fee_bps)
ref_marketing = (ref_l1 − ref_l1_real) + (ref_l2 − ref_l2_real)   # demo qism uchun — platforma budjetidan
platform      = fee_real − ref_l1_real − ref_l2_real          # 2.13% (demo bo‘lmasa)
```

- Referal zanjiri: ustani taklif qilgan odam (L1) va L1’ni taklif qilgan odam (L2). Zanjir ro‘yxatdan o‘tishda belgilanadi va o‘zgarmaydi.
- Referal bonusi faqat ustalar to‘lagan xizmat haqidan beriladi. Buyurtmachini taklif qilgan odam bonus olmaydi (U2 ekrani: "Siz taklif qilgan ustalar bajargan har bir ishdan bonus olasiz").
- Bonus L1 va L2’ning `REAL` hisobiga yoziladi va uni yechish mumkin.
- L1 yoki L2 bo‘lmasa yoki bloklangan bo‘lsa, uning real qismdagi ulushi platformaga qoladi, demo qism uchun esa hech narsa to‘lanmaydi.
- Demo hisobidan to‘langan qism (`fee_demo`) platforma daromadi emas: `DEMO_SINK` hisobiga yoziladi, hisobotlarda "Demo komissiya — daromadga qo‘shilmaydi" deb ko‘rsatiladi.
- Demodan to‘langan xizmat haqidan ham referal bonusi beriladi (tasdiqlangan). Uni platforma o‘z budjetidan to‘laydi: `ref_marketing` → `PLATFORM_MARKETING` hisobidan. Hisobotda "Demo ishlar referali" deb alohida ko‘rinadi.
- Ustaning daromadi referal tufayli kamaymaydi: bonus platformaning ulushidan yoki budjetidan to‘lanadi.

## 7. Hamyon

Hisoblar:

- `REAL` — haqiqiy pul, yechsa bo‘ladi.
- `DEMO` — faqat ustada bo‘ladi. Yechib bo‘lmaydi, boshqaga o‘tkazib bo‘lmaydi, bepul davr tugaganda yonib ketadi.
- Holdlar — alohida hisob emas, `wallet_holds` jadvalidagi yozuvlar.

**To‘ldirish** (BJ6 ekrani): Click, Payme yoki karta orqali. Eng kam summa: `topup_min` (1 000 so‘m). To‘ldirish uchun foydalanuvchidan haq olinmaydi.

**Hisobdan hisobga**: faqat aniq bir buyurtma uchun to‘lov sifatida (buyurtmachidan ustaga, BY5 ekrani). Buyurtmaga bog‘lanmagan erkin o‘tkazma qilinmaydi (§14).

**Pul yechish** (BJ7 ekrani), bog‘langan kartaga (Uzcard, Humo):

```
must_keep    = MAX(0, Σ faol_hold − demo_active)       # hisobda qolishi shart bo‘lgan xizmat haqi
wfee(M)      = ROUND_HALF_UP(M × withdraw_fee_bps / 10 000)   # 100 bps = 1%, bank o‘tkazma xizmati
max_withdraw = M ning eng katta qiymati, bunda M + wfee(M) ≤ real − must_keep
```

- So‘ralgan summa `max_withdraw`dan katta bo‘lsa, `WALLET_WITHDRAW_EXCEEDS_LIMIT` xatosi qaytadi. Parametrlar: `must_keep`, `max`, `fee`. Xabar: "Hisobingizda ilova xizmati uchun {must_keep} so‘m qolishi kerak. Ko‘pi bilan {max} so‘m yechishingiz mumkin (bank o‘tkazma xizmati 1% — {fee} so‘m)."
- Hamma ishlar yopilgan bo‘lsa (`must_keep = 0`), butun balansni yechish mumkin (1% bank xizmati ayirilgan holda).
- Buyurtmachi ham xuddi shu formula bilan pul yechadi, 1% unga ham qo‘llanadi (tasdiqlangan; odatda `must_keep = 0`).
- 1% — bank (to‘lov provayderi) o‘tkazma xizmati haqi. Platforma bundan hech narsa olmaydi (tasdiqlangan): summa `PAYOUT_PROVIDER_FEES` tranzit hisobiga yoziladi va provayderga to‘lanadi, daromad hisobotiga kirmaydi. Provayder tarifi o‘zgarsa, super admin `withdraw_fee_bps`ni unga tenglaydi.
- Pul yechish holatlari: `REQUESTED → PROCESSING → PAID` yoki `FAILED`. `FAILED` bo‘lsa, summa va bank xizmati haqi to‘liq qaytariladi.

Tarixdagi amal turlari (BJ5 ekrani): Daromad, Xizmat haqi (demodan bo‘lsa "DEMO" belgisi bilan), Referal bonusi (1- yoki 2-qatlam), To‘ldirish, Pul yechish, Bank xizmati.

## 8. Bepul davr va demo bonus

- Bepul davr usta rolini birinchi marta faollashtirganda boshlanadi (MyID’dan keyin). PINFL bo‘yicha faqat bir marta beriladi. Davomiyligi `free_period_days` (30 kun).
- Boshlanishida `demo_bonus` (25 000 so‘m) `DEMO` hisobiga yoziladi. Bu ham PINFL bo‘yicha bir marta.
- Bepul davrda hujjat so‘ralmaydi. Xizmat haqi avval demodan yechiladi.
- Demo pul platforma daromadi emas. Demodan to‘langan xizmat haqi uchun ham referal bonusi beriladi — platforma budjetidan (§6).
- Bepul davr tugaganda band qilinmagan demo yonib ketadi (`DEMO_EXPIRE`). Faol ishlar uchun band qilingan demo yonmaydi (§4). Usta soliq usulini tanlamaguncha yangi ish ololmaydi (BJ8 ekrani).
- Tugashidan 7, 3 va 1 kun oldin push-eslatma yuboriladi.
- Buyurtmachiga demo bonus berilmaydi.

## 9. Soliq usullari

GTM hech qachon soliq ushlamaydi, faqat 2.5% xizmat haqi oladi. Bepul davrdan keyin usta quyidagi ikki usuldan birini tanlashi shart:

1. **O‘zini o‘zi band** (`SELF_EMPLOYED`):
   - Maqom davlat soliq tizimida PINFL bo‘yicha tekshiriladi.
   - Avtomatik tekshirib bo‘lmasa, usta guvohnoma rasmini yuklaydi va admin qo‘lda tasdiqlaydi (AD1 ekrani: "Hujjat murojaatlari").
   - `valid_until` saqlanadi. Muddat tugashidan 7 kun oldin eslatma yuboriladi. Muddat o‘tsa, yangilanmaguncha yangi ish olinmaydi.
   - Soliqni usta o‘zi to‘laydi.
2. **Paynet Xolis** (`XOLIS`):
   - Usta Xolis ilovasida ro‘yxatdan o‘tadi.
   - GTM’da Xolis QR-kodini (skanerlab yoki rasmdan) va Xolis’dagi telefon raqamini ulaydi (BJ10 ekrani).
   - Maqom (YaTT yoki o‘zini o‘zi band) PINFL bo‘yicha tekshiriladi.
   - Buyurtmachi ustaning Xolis QR-kodiga to‘laydi, 1% soliqni Xolis avtomatik to‘laydi.
   - To‘lov ilovada ikki tomonlama tasdiqlanadi: buyurtmachi "To‘ladim", usta "Pulni qabul qildim" (§5.1).
   - GTM 2.5% xizmat haqini ustaning GTM balansidan avtomatik oladi — usta "Pulni qabul qildim"ni bosganda.
   - Xolis’ning ochiq API’si yo‘q, shuning uchun tekshiruv qo‘lda bo‘ladi (adapter tayyorlab qo‘yiladi).

Qo‘shimcha:

- Usul holatlari: `NONE`, `PENDING`, `VERIFIED`, `REJECTED`, `EXPIRED`.
- Usulni keyin almashtirish mumkin: Sozlamalar → Soliq holati.
- Super admin usullarni yoqadi yoki o‘chiradi (SA5 ekrani). O‘chirilgan usul ustalarga ko‘rinmaydi.
- Tanlash ekranida ikkala usul uchun 500 000 so‘mlik misol ko‘rsatiladi: GTM 12 500 so‘m oladi, soliq 5 000 so‘m.

## 10. Jonli joylashuv va xarita (Google Maps)

- Xarita provayderi: Google Maps Platform.
  - Maps SDK — xaritani ko‘rsatish.
  - Geocoding — belgidan manzilni aniqlash.
  - Places Autocomplete — manzil qidirish.
  - Routes — marshrut va yetib kelish vaqti.
- Geocoding, Places va Routes faqat backend orqali chaqiriladi. Mobil ilovada faqat Maps SDK kaliti bo‘ladi (paket nomi yoki bundle ID bilan cheklangan).
- **Manzil** (BY6 ekrani): buyurtmachi xaritani surib, belgini uyiga qo‘yadi. Manzil matni geocoding orqali to‘ladi. Podyezd, qavat, xonadon va mo‘ljal (ixtiyoriy) qo‘lda yoziladi.
- **Manzil** e’londa ustalarga ko‘rinadi, qabul qilishdan oldin ham (tasdiqlangan, §3.4). Buyurtmachining telefon raqami — faqat qabul qilgan ustaga.
- **Ulashish ixtiyoriy** (tasdiqlangan): usta joylashuvini ulashmasa ham ishni bajaradi. Buyurtmachiga "Usta joylashuvini ulashmagan" deb ko‘rsatiladi, manzil telefon orqali yoki boshqa yo‘l bilan aniqlashtiriladi.
- **Ulashish boshlanishi**: usta "Yo‘lga chiqdim"ni bosadi. Birinchi marta BJ11 ekrani ko‘rsatiladi va rozilik yozib qo‘yiladi. Buyurtma `EN_ROUTE` holatiga o‘tadi.
- **Uzatish**:
  - Usta ilovasi har `location_interval_sec` (5) soniyada joylashuvni WebSocket orqali yuboradi.
  - Server oxirgi nuqtani Redis’da saqlaydi va `trip_points` jadvaliga yozadi.
  - Nuqta faqat shu buyurtmaning buyurtmachisiga yuboriladi.
- **Yetib kelish vaqti (ETA)**: server Routes API orqali har `eta_refresh_sec` (120) soniyada yoki usta yo‘ldan 300 m dan ko‘p chetga chiqsa qayta hisoblaydi. Har bir nuqtada hisoblanmaydi (Google so‘rovlarini tejash uchun).
- **Ulashish o‘zi to‘xtaydi**, agar:
  - usta "Yetib keldim"ni bossa;
  - manzilgacha `auto_stop_radius_m` (50 m) qolsa;
  - buyurtma bekor qilinsa;
  - `max_trip_minutes` (180 daqiqa) o‘tsa.
  To‘xtagandan keyin buyurtmachi ustaning joylashuvini ko‘rmaydi (BY8 ekrani).
- **Navigatsiya**: "Google Maps’da ochish" tugmasi `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=driving` havolasini ochadi. Ilova ichida burilishma-burilish navigatsiya qilinmaydi.
- **Saqlash**: yo‘l nuqtalari `track_retention_days` (30 kun) saqlanadi, keyin o‘chiriladi. Adminlar jonli joylashuvni ko‘rmaydi. Saqlangan yo‘lni faqat nizo ko‘rib chiqilayotganda, `disputes.resolve` ruxsati bilan ko‘rish mumkin.
- **Fon rejimi**: Androidda foreground service ishlaydi va doimiy bildirishnoma turadi: "{appName} joylashuvingizni mijozga ko‘rsatmoqda". iOS’da background location rejimi ishlatiladi.

## 11. Test holatlari (albatta o‘tishi kerak)

Standart stavkalar: `fee_bps = 250`, `ref_l1_bps = 25`, `ref_l2_bps = 12`, `withdraw_fee_bps = 100`. Hamma summalar so‘mda.

| # | Kirish | Kutilgan natija |
|---|---|---|
| T1 | 180 000, naqd, demo 1 500, real 551 250, ikkala referal bor | fee 4 500 = demo 1 500 + real 3 000; L1 450 (300 real’dan + 150 budjetdan); L2 216 (144 + 72); platforma 2 556; marketing 222; keyin real 548 250, demo 0 |
| T2 | 500 000, Click QR, demo 14 000, ikkala referal bor | fee 12 500 to‘liq demodan; L1 1 250 va L2 600 — ikkalasi budjetdan (marketing 1 850); platforma 0; usta real +500 000; demo 1 500 qoladi |
| T3 | 600 000, karta, demo 0, ikkala referal bor | fee 15 000; L1 1 500; L2 720; platforma 12 780 |
| T4 | 300 000, naqd, demo 0, ikkala referal bor | fee 7 500 balansdan; L1 750; L2 360; platforma 6 390 |
| T5 | 400 000, Xolis QR, demo 0, ikkala referal bor | fee 10 000 balansdan; L1 1 000; L2 480; platforma 8 520 |
| T6 | Qabul: narx 800 000, available 4 500 | 250 bps bo‘lsa: required 20 000, shortfall 15 500. 300 bps bo‘lsa: required 24 000, shortfall 19 500 |
| T7 | Yechish: real 621 000, hold 15 000, demo 0, so‘rov 621 000 | Xato: must_keep 15 000, max 600 000, fee 6 000. So‘rov 600 000 bo‘lsa — o‘tadi, keyin real 15 000 |
| T8 | Yechish: real 100 000, hold 0 | max 99 010, bank xizmati 990 |
| T9 | 200 000, real, referal yo‘q | fee 5 000; L1 0; L2 0; platforma 5 000 |
| T10 | Yaxlitlash: 123 457, real, ikkala referal bor | fee 3 086; L1 308; L2 148; platforma 2 630 |
| T11 | Hisobot: aylanma 52 000 000, shundan 5 600 000 demodan to‘langan ishlar, hamma ishda ikkala referal bor | komissiya (real) 1 160 000; L1 130 000 (shundan 14 000 budjetdan); L2 62 400 (shundan 6 720 budjetdan); platforma 988 320; marketing 20 720; platforma sof 967 600; demo komissiya 140 000 (daromad emas) |
| T12 | 300 000, naqd, demo 0, real 50 000: buyurtmachi "To‘ladim", usta "Pulni qabul qildim" | `PAID`; fee 7 500 real’dan avtomatik yechiladi; keyin real 42 500 |
| T13 | Usta: #1031 (naqd) `DONE_BY_EXECUTOR` yoki `COMPLETED`, "Pulni qabul qildim" bosilmagan; yangi ishni qabul qilish | Xato `ORDER_EXECUTOR_CONFIRMATION_REQUIRED` (order 1031) |
| T14 | Buyurtmachi: #1031 `DONE_BY_EXECUTOR`, "To‘ladim" bosilmagan; yangi buyurtma | Xato `ORDER_CUSTOMER_CONFIRMATION_REQUIRED` (order 1031) |
| T15 | T13 holatida usta "Pul kelmadi"ni bosadi | `DISPUTED`; usta cheklovi olinadi; hold saqlanadi |
| T16 | Referal kodsiz ro‘yxatdan o‘tish | Xato `AUTH_REFERRAL_REQUIRED` |
| T17 | Buyurtmachi pul yechadi: real 100 000, hold 0 | max 99 010; bank xizmati 990 → `PAYOUT_PROVIDER_FEES`; platforma daromadi o‘zgarmaydi |
| T18 | Bepul oy tugadi; `ACCEPTED` ish: fee 4 500, qabul qilinganda demo 4 500 band qilingan | Band qilingan demo yonmaydi; `PAID`da fee demodan yechiladi |

Ledger invarianti: har bir tranzaksiyada yozuvlar yig‘indisi 0. Foydalanuvchi hisoblari manfiy bo‘lmaydi (§5dagi qarz holatidan tashqari).

## 12. Sozlamalar va standart qiymatlar

Super admin o‘zgartiradi (SA2, SA5, SA6 ekranlari). Har bir o‘zgarish `audit_logs`ga yoziladi. Yangi stavka faqat yangi qabul qilingan buyurtmalarga ta’sir qiladi.

| Kalit | Standart | Izoh |
|---|---|---|
| `fee_bps` | 250 | 2.5% |
| `ref_l1_bps` | 25 | 0.25% |
| `ref_l2_bps` | 12 | 0.12% |
| `accept_threshold_bps` | 250 | 2.5%, tasdiqlangan |
| `withdraw_fee_bps` | 100 | 1% — bank o‘tkazma xizmati, platforma olmaydi |
| `topup_min` | 1 000 so‘m | |
| `free_period_days` | 30 | |
| `free_period_reminder_days` | 7, 3, 1 | Bepul davr tugashidan oldingi push-eslatmalar (§8) |
| `demo_bonus` | 25 000 so‘m | |
| `otp_length` / `otp_ttl_sec` / `otp_resend_sec` / `otp_max_attempts` | 6 / 300 / 60 / 5 | |
| `otp_phone_limit` / `otp_ip_limit` / `otp_limit_window_sec` | 3 / 10 / 600 | Bitta telefon raqamiga va bitta IP’ga 10 daqiqada yuboriladigan SMS kodlar soni (§2) |
| `login_attempt_limit` / `login_attempt_window_sec` | 5 / 900 | Noto‘g‘ri paroldan keyin kirish 15 daqiqaga bloklanadi |
| `min_age_years` | 16 | Eng kam yosh, MyID’dagi tug‘ilgan sana bo‘yicha (§2) |
| `order_photos_max` | 5 | Buyurtmadagi rasmlar soni (§3.1) |
| `upload_max_mb` | 5 | Bitta yuklanadigan rasm hajmi |
| `qr_payment_ttl_sec` | 300 | BJ4: QR amal qilish vaqti |
| `location_interval_sec` | 5 | |
| `eta_refresh_sec` | 120 | |
| `route_deviation_m` | 300 | Usta yo‘ldan shuncha chetga chiqsa ETA qayta hisoblanadi (§10) |
| `auto_stop_radius_m` | 50 | |
| `max_trip_minutes` | 180 | |
| `track_retention_days` | 30 | |
| `self_employed_reminder_days` | 7 | |
| `tax_methods_enabled` | `SELF_EMPLOYED`, `XOLIS` | |
| `payment_methods_enabled` | hammasi | §5 |
| `referral_required` | `true` | Kodsiz ro‘yxatdan o‘tib bo‘lmaydi (hozircha hamma uchun) |
| `ref_on_demo_fee` | `true` | Demodan to‘langan xizmat haqi uchun ham referal — platforma budjetidan |
| `address_visible_before_accept` | `true` | Manzil e’londa ko‘rinadi; telefon — qabul qilgandan keyin |
| `confirm_reminder_hours` | 2, 24 | "To‘ladim" / "Pulni qabul qildim" eslatmalari |
| `confirm_admin_task_hours` | 48 | Tasdiqlanmagan to‘lov adminga vazifa bo‘ladi |

## 13. Ochiq savollar (javob kelguncha standart qiymat ishlatiladi)

| # | Savol | Hozirgi standart |
|---|---|---|
| 1 | Ilova nomi, domen va identifikatorlar qanday bo‘ladi? | Hozircha **GTM** (ishchi nom). Domen va tovar belgisi tekshirilgach nom yakunlanadi. Kodda `APP_NAME`, `APP_DOMAIN`, `APP_BUNDLE_ID` sozlamalari ishlatiladi. Bundle ID birinchi relizdan oldin tanlanadi, keyin o‘zgarmaydi |
| 2 | Referal kod majburiyligi buyurtmachiga ham tegishlimi? | Ha, hammaga: buyurtmachi ham, usta ham kodsiz ro‘yxatdan o‘ta olmaydi |

Hal qilingan savollar (2026-09-25):

- Ish olish sharti — **2.5%** (3% emas).
- Har bir olingan ishdan 2.5% olinadi; bir nechta faol ishda har biriga alohida hold bo‘ladi (§4).
- Naqd va Xolis to‘lovi ikki tomonlama tasdiqlanadi: buyurtmachi "To‘ladim", usta "Pulni qabul qildim"; 2.5% usta hisobidan avtomatik yechiladi. Bosmagan buyurtmachi yangi buyurtma joylay olmaydi, bosmagan usta yangi ish ololmaydi (§5.1).
- Xolis’dagi ustaga qaysi usulda to‘lansa ham shu tasdiqlash tartibi ishlaydi. Soliq: Xolis QR orqali — Xolis to‘laydi, naqd — usta o‘zi.
- Nizo paytida pulni admin ushlab turadi.
- Usta joylashuvini ulashmasa ham ishlaydi — manzilni telefon yoki boshqa yo‘l bilan aniqlashtiradi.
- Manzil ish olinishidan oldin ham ko‘rinadi; telefon raqam — faqat qabul qilgandan keyin.
- Bepul oy ish o‘rtasida tugasa, hisob-kitob qabul qilinganda oldindan qilingan bo‘ladi va ish shu shartlar bilan yakunlanadi.
- Referal havolasi yoki kodi bo‘lmasa, ro‘yxatdan o‘tib bo‘lmaydi.
- Bekor qilganga jarima yo‘q.
- Usta "Ishni tugatdim"ni bosmaguncha pul ololmaydi; naqd va Xolis’da — tasdiqlash tartibi (§5.1).
- Pul yechishda 1% olinadi, buyurtmachidan ham. Bu — bank o‘tkazma xizmati, platforma hech narsa olmaydi.
- Demodan to‘langan xizmat haqidan ham referal beriladi — platforma budjetidan.
- Super admin faqat CLI buyrug‘i bilan yaratiladi (§1).

Hal qilingan savollar (2026-09-26):

- Taklif kodi faqat MyID’dan o‘tgan va bloklanmagan foydalanuvchida ishlaydi. Ro‘yxatdan o‘tishni tugatmagan yoki bloklangan odamning kodi bilan ro‘yxatdan o‘tib bo‘lmaydi.
- Eng kam yosh — 16 (`min_age_years`). Yoshi yetmagan odam MyID bosqichida to‘xtaydi.
- Takroriy PINFL chiqsa, yangi (hali tugallanmagan) ro‘yxatdan o‘tish o‘chiriladi, telefon raqami bo‘shaydi; K3d’da mavjud hisobning niqoblangan raqami, ochilgan sanasi va bepul davr ishlatilgani ko‘rsatiladi.
- Elektron pochta tasdiqlanmaydi (pochta provayderi yo‘q), faqat unikal bo‘ladi.
- Ilova o‘rnatilmagan holda bosilgan taklif havolasi kodni o‘rnatishdan keyin olib o‘tmaydi (deferred deep link). Hozircha kod K2’da qo‘lda kiritiladi; havola ilova o‘rnatilgan telefonda ishlaydi. Domen tanlangach App Links / Universal Links va Play Install Referrer qo‘shiladi.
- Til tanlash ekranida (Main) ko‘rinish uchta: Kunduzgi, Tungi, Avto.
- §2, §3.1, §8, §10’da tilga olingan limitlar ham sozlamaga aylandi (§12): eslatma kunlari, OTP cheklovi, rasmlar soni va hajmi, yo‘ldan chetga chiqish masofasi. IP bo‘yicha OTP cheklovi (10) — texnik standart qiymat.

Hal qilingan savollar (2026-09-26, 2-bosqich):

- Vaqt oralig‘i o‘tib ketgan va hech bir usta olmagan buyurtma avtomatik bekor qilinadi (`EXPIRED`), buyurtmachi qayta joylashi mumkin.
- Qabul qilingan buyurtmani bekor qilish sabablari: usta endi kerak emas; boshqa usta topdim; usta kechikyapti yoki javob bermayapti; narx yoki shartlarda kelisha olmadik; boshqa sabab (matn bilan).
- Boshlang‘ich kategoriyalar: Elektrik, Santexnik, Ta’mirlash, Tozalash, Mebel, Konditsioner va Boshqa. Keyin super admin o‘zgartiradi.
- Demo bonus (§8) usta bepul davri boshlanganda ledger orqali `DEMO` hisobiga yoziladi — 2-bosqichdan: ish qabul qilish sharti (§4) balansga tayanadi.

Hal qilingan savollar (2026-09-26, 4-bosqich):

- To‘lov usulini ish tugagach almashtirib bo‘lmaydi: buyurtma joylanganda tanlangan usulda to‘lanadi. BY5 faqat shu usulni ko‘rsatadi; BJ4 (QR) faqat Click yoki Payme buyurtmasida, o‘sha provayder bilan ochiladi. Online buyurtmani naqdga o‘tkazish ("Naqd pulni qabul qildim") yo‘q.

## 14. Yuridik talablar (real pul bilan ishga tushirishdan oldin)

- **Elektron pul**: O‘zbekistonda elektron pulni faqat tijorat banklari va Markaziy bank chiqara oladi. Ilovadagi balans, uni to‘ldirish, hisobdan hisobga o‘tkazish va pul yechish shu toifaga kirishi mumkin. Litsenziyali bank yoki to‘lov tashkiloti bilan hamkorlik sxemasini yurist tasdiqlasin. Ungacha ledger yoziladi, lekin payout feature flag ortida turadi.
- **Shaxsga doir ma’lumotlar**:
  - Rozilik matnida operator nomi va STIR bo‘ladi (`[MChJ nomi]`, `STIR [raqam]`).
  - MyID (biometriya) va joylashuv uchun alohida rozilik olinadi.
  - Ma’lumotlar bazasi davlat reyestriga ro‘yxatdan o‘tkaziladi.
  - Lokalizatsiya talabi 2026-yilda yumshatildi, lekin aniq shartlarini yurist bilan tekshiring. Standart: asosiy baza O‘zbekistondagi serverda turadi.
- **Shartnomalar**: MyID (`sessionId`, `clientHash`, `clientHashId` MyID savdo bo‘limi beradi), Click va Payme merchant, Eskiz SMS, Google Maps Platform (billing hisobi), payout provayderi.
- **Soliq**: GTM soliq ushlamaydi. GTM orqali o‘tadigan to‘lovlar bo‘yicha soliq agenti majburiyati bor-yo‘qligini soliq maslahatchisi tasdiqlasin.
- **Nom va tovar belgisi**: «GTM» va «Get the money» nomi tovar belgisi sifatida bo‘shligini tekshirib, ro‘yxatdan o‘tkazing (patent vakili yordam beradi). App Store va Google Play’da shu nomli ilova bor-yo‘qligini ham tekshiring.

## 15. 4 tilda asosiy xabarlar

Kalitlar mobil ilovadagi i18n fayllarida bo‘ladi. Tojikcha (`tg`) matnlarni ona tili egasi tekshirsin.

| Kalit | uz | ru | en | tg |
|---|---|---|---|---|
| `wallet.insufficientToAccept` | Bu ishni olish uchun yana {shortfall} so‘m to‘ldiring. | Чтобы взять этот заказ, пополните баланс ещё на {shortfall} сум. | Top up {shortfall} UZS more to take this job. | Барои гирифтани ин кор ҳисобатонро боз {shortfall} сӯм пур кунед. |
| `wallet.withdrawMustKeep` | Hisobingizda ilova xizmati uchun {must_keep} so‘m qolishi kerak. Ko‘pi bilan {max} so‘m yechishingiz mumkin (bank o‘tkazma xizmati 1% — {fee} so‘m). | На балансе должно остаться {must_keep} сум для оплаты сервиса. Можно вывести не более {max} сум (комиссия банка за перевод 1% — {fee} сум). | {must_keep} UZS must stay in your balance for the app service fee. You can withdraw up to {max} UZS (1% bank transfer fee: {fee} UZS). | Дар ҳисобатон барои хизмати барнома {must_keep} сӯм бояд бимонад. Шумо ҳадди аксар {max} сӯм гирифта метавонед (хизмати интиқоли бонк 1% — {fee} сӯм). |
| `auth.duplicatePerson` | Bu shaxs uchun hisob allaqachon mavjud. | Для этого человека уже есть аккаунт. | An account for this person already exists. | Барои ин шахс аллакай ҳисоб мавҷуд аст. |
| `tax.required` | Bepul oy tugadi. Ishni davom ettirish uchun soliq usulini tanlang. | Бесплатный месяц закончился. Чтобы продолжить, выберите способ уплаты налога. | Your free month has ended. Choose a tax method to keep working. | Моҳи ройгон ба охир расид. Барои идомаи кор усули андозро интихоб кунед. |
| `trip.sharing` | Joylashuvingiz mijozga ko‘rinmoqda | Ваше местоположение видно клиенту | Your location is visible to the customer | Ҷойгиршавии шумо ба мизоҷ намоён аст |
| `trip.eta` | {min} daqiqada yetib keladi | Прибудет через {min} мин | Arrives in {min} min | Пас аз {min} дақиқа мерасад |
| `payment.iPaid` | To‘ladim | Я оплатил | I paid | Пардохт кардам |
| `payment.iReceived` | Pulni qabul qildim | Деньги получил | Money received | Пулро гирифтам |
| `payment.notReceived` | Pul kelmadi | Деньги не пришли | Money didn’t arrive | Пул наомад |
| `order.customerConfirmRequired` | Oldingi buyurtma (#{order}) uchun «To‘ladim»ni bosing — shundan keyin yangi buyurtma joylaysiz. | Нажмите «Я оплатил» по предыдущему заказу (#{order}) — после этого сможете разместить новый. | Tap “I paid” for your previous order (#{order}) — then you can post a new one. | Барои фармоиши қаблӣ (#{order}) «Пардохт кардам»-ро пахш кунед — баъд фармоиши нав гузошта метавонед. |
| `order.executorConfirmRequired` | Oldingi ish (#{order}) uchun «Pulni qabul qildim»ni bosing — shundan keyin yangi ish olasiz. | Нажмите «Деньги получил» по предыдущему заказу (#{order}) — после этого сможете взять новый. | Tap “Money received” for your previous job (#{order}) — then you can take a new one. | Барои кори қаблӣ (#{order}) «Пулро гирифтам»-ро пахш кунед — баъд кори нав гирифта метавонед. |
| `payment.feeCharged` | Xizmat haqi {fee} so‘m hisobingizdan yechildi. | С вашего баланса списана комиссия сервиса {fee} сум. | A {fee} UZS service fee was charged from your balance. | Ҳаққи хизмат {fee} сӯм аз ҳисоби шумо гирифта шуд. |
| `auth.referralRequired` | Ro‘yxatdan o‘tish uchun taklif havolasi yoki kodi kerak. | Для регистрации нужна ссылка-приглашение или код. | You need an invite link or code to sign up. | Барои сабти ном пайванд ё рамзи даъват лозим аст. |
