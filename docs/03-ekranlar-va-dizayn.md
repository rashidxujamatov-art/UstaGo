# GTM (Get the money) — ekranlar va dizayn

## 1. Dizayn manbasi

- Dizayn Claude’dagi "GTM — Get the money · mobil ilova dizayni" kanvasida turadi: 44 ta ekran, har biri kunduzgi va tungi rejimda.
- Claude Code kanvasni ocha olmaydi, shuning uchun har bir ekran PNG qilib `Fronted rasmlar/` papkasiga saqlangan. Fayl nomi — ekran ID’si, masalan `BJ2-Qabul-qilish.png` (Til tanlash ekrani — `Main-Til-tanlash.png`). Rasm 2x o‘lchamda: chapda kunduzgi, o‘ngda tungi rejim; `U4-Tort-til.png`da bitta ekran 4 tilda. Kanvas o‘zgarsa, rasmlar qayta eksport qilinadi.
- Uslub: Telegram’ga yaqin. Ko‘k sarlavha paneli, ro‘yxat qatorlari, yumaloq kartalar, pastdan chiqadigan oynalar (bottom sheet). Yoshi kattalar uchun: yirik matn va katta tugmalar.

## 2. Dizayn tokenlari

### 2.1. Ranglar

| Token | Kunduzgi | Tungi | Ishlatilishi |
|---|---|---|---|
| `bar` | #2461C2 | #212E3C | Sarlavha paneli |
| `barText` | #FFFFFF | #EEF2F6 | Sarlavha matni |
| `barText2` | #D9E5F7 | #AAB6C3 | Sarlavha ostidagi matn |
| `pillBg` / `pillText` | #FFFFFF / #1F5BBE | #2B4A6F / #CFE3FB | Sarlavhadagi belgi (rol, son) |
| `bg` | #FFFFFF | #18222D | Maydonlar foni |
| `bg2` | #F0F2F5 | #0F161E | Ekran foni |
| `surface` | #FFFFFF | #18222D | Kartalar |
| `surface2` | #F2F4F7 | #222F3D | Ichki bloklar |
| `text` | #0F1720 | #EEF2F6 | Asosiy matn |
| `text2` | #5B6875 | #93A2B2 | Ikkinchi darajali matn |
| `sep` | #E3E7EC | #2A3746 | Ajratuvchi chiziq |
| `border` | #8794A1 | #5F6E7E | Input chegarasi |
| `brand` | #2461C2 | #2F6FCB | Asosiy tugma |
| `brandText` | #2360C4 | #6AAEF5 | Havola, belgilangan matn |
| `brandSoft` | #E7EFFC | #1F3652 | Yumshoq ko‘k fon |
| `green` / `greenSoft` | #17743D / #E3F4EA | #4FC37E / #183A2A | Muvaffaqiyat, tasdiq |
| `orange` / `orangeSoft` | #A8540C / #FDF0E1 | #F2A650 / #3D2C17 | Ogohlantirish, demo, naqd |
| `red` / `redSoft` | #C6322A / #FCE9E7 | #F2766C / #3E2124 | Xato, manfiy summa |
| `bubbleIn` / `bubbleOut` | #FFFFFF / #DCEAFD | #1E2A37 / #2B5079 | Chat pufakchalari |
| `wall` | #DFE7EF | #0E151D | Chat foni |
| `scrim` | rgba(15,23,32,.45) | rgba(0,0,0,.55) | Modal orqa foni |
| `destinationPin` | #E0483F | #E0483F | Xaritadagi manzil belgisi |

Xarita (Google Maps’ning o‘z uslubi ustiga, ixtiyoriy): kunduzi yo‘l #FFFFFF, bino #DAE1E9, park #CBE6C9; tunda yo‘l #2B3947, bino #1A2530, marshrut #4D8FE8.

### 2.2. Shrift va o‘lchamlar

- Shrift: **Golos Text** (400, 500, 600, 700).
- O‘lchamlar: 13 — izoh; 14–15 — ikkinchi darajali matn; 16–17 — asosiy matn; 19–20 — sarlavha paneli; 22–24 — ekran sarlavhasi; 30–36 — katta summa.
- "Matn o‘lchami: Katta" sozlamasida hamma o‘lchamlar 1.15 barobar kattalashadi.
- Burchaklar: 10, 12, 14, 16 (karta), 24 (bottom sheet).
- Oraliqlar: 4, 8, 12, 16, 20, 24.
- Tugmalar: asosiy — balandligi 56, ikkinchi darajali — 48–52. Hamma bosiladigan joy kamida 48×48.
- Sarlavha paneli: status bar + 56 px.

### 2.3. Format

- Pul: `180 000 so‘m` (minglar bo‘sh joy bilan ajratiladi). Manfiy summa: `−4 500 so‘m`.
- Sana: `18.10.2026`, vaqt: `10:41`.
- Telefon: `+998 90 123 45 67`. Admin ro‘yxatlarida niqoblangan: `+998 93 *** 21 08`.
- Buyurtma raqami: `#1024`.

### 2.4. Brend

- Hozirgi (ishchi) nomi **GTM**, to‘liq nomi **GTM — Get the money**. 4 tilda ham tarjima qilinmaydi. Nom o‘zgarsa, belgidagi «G» va yozuvlar ham yangilanadi.
- Ilova belgisi: `brand` rangidagi 76×76 kvadrat (burchagi 24), ichida oq «G» — markazga qaragan strelka bilan. SVG (24×24, chiziq 2.4, uchlari yumaloq): `M18.36 5.64A9 9 0 1 0 21 12h-8` va `M15.5 9.5L13 12l2.5 2.5`.
- Til tanlash ekrani (`Main-Til-tanlash.png`): belgi, ostida `GTM` (32 px, 700, harf oralig‘i 1.5 px), keyin `GET THE MONEY` (13 px, 600, katta harflar, harf oralig‘i 2.4 px, `brandText`), keyin "Usta toping yoki buyurtma oling" (16 px, `text2`).
- Sarlavha panelida faqat `GTM` (21 px, 700, harf oralig‘i 0.5 px). Bosh menyu pastida: `GTM — Get the money · 1.0.0`.
- BJ4’dagi to‘lov QR kodining o‘rtasida shu belgining kichik varianti (30×30, burchagi 8).

## 3. Ekranlar ro‘yxati (44 ta)

### 3.1. Kirish va ro‘yxatdan o‘tish

| ID | Nomi | Asosiy elementlar |
|---|---|---|
| Main | Til tanlash | Logo, "Usta toping yoki buyurtma oling", 4 til (O‘zbekcha, Русский, English, Тоҷикӣ), Kunduzgi/Tungi, "Davom etish", "Hisobingiz bormi? Kirish" |
| K2 | Ro‘yxatdan o‘tish | "Ro‘yxatdan o‘tish / Kirish" tablari, "Sizni {ism} taklif qildi" (taklif kodi majburiy), telefon, elektron pochta, parol |
| K3 | SMS tasdiqlash | 2/5, 6 xonali kod, qayta yuborish taymeri, "Raqamni o‘zgartirish", "Kodni hech kimga aytmang" |
| K3b | MyID: hujjat | 3/5, ID-karta yoki pasport, seriya va raqam, tug‘ilgan sana, rozilik belgisi (`[MChJ nomi]`, `STIR [raqam]`) |
| K3c | MyID: yuz | 4/5, yuz ramkasi, "ko‘zingizni sekin yuming", maslahatlar (yorug‘ joy, ko‘zoynaksiz, bosh kiyimsiz) |
| K3d | Takroriy shaxs | "Bu shaxs uchun hisob bor", "Mavjud hisobga kirish" |
| K4 | Rol tanlash | 5/5, Buyurtmachi va Bajaruvchi kartalari, "1-oy bepul: 25 000 so‘m bonus" |

### 3.2. Buyurtmachi

| ID | Nomi | Asosiy elementlar |
|---|---|---|
| BY1 | Bosh sahifa | Balans, filtr (Barchasi, Faol, Yakunlangan), kategoriyalar, "Mening buyurtmalarim", "Buyurtma berish" |
| BY2 | Yangi buyurtma | Kategoriya, ish nomi, tavsif, rasmlar, manzil (→ BY6), vaqt, narx, to‘lov usuli (Hisobdan, Click QR, Payme QR, Karta, Naqd), "Buyurtmani joylash" |
| BY3 | Buyurtma holati | Usta kartasi (qo‘ng‘iroq, yozish), holatlar ro‘yxati, tafsilotlar, "Shikoyat", "Qabul qilish va to‘lash" |
| BY4 | Usta bilan chat | Telegram uslubidagi chat, buyurtma havolasi |
| BY5 | To‘lov (hisobdan hisobga) | Summa, balans oldin va keyin, "Xizmat haqi usta hisobidan olinadi" |
| BY6 | Manzilni xaritada belgilash | Qidiruv, markazdagi belgi, "Belgini uyingiz ustiga qo‘ying", podyezd, qavat, xonadon, mo‘ljal, "Manzilingiz e’londa ustalarga ko‘rinadi. Telefon raqamingiz — faqat ishni olgan ustaga" |
| BY7 | Usta yo‘lda | Jonli xarita, "12 daqiqada yetib keladi", bosqichlar, usta kartasi, "Usta yetib kelgach kuzatuv o‘zi to‘xtaydi" |
| BY8 | Usta yetib keldi | Yashil belgi, "Kuzatuv to‘xtadi", qo‘ng‘iroq, yozish, "Buyurtmaga qaytish" |

### 3.3. Bajaruvchi (usta)

| ID | Nomi | Asosiy elementlar |
|---|---|---|
| BJ1 | Yangi buyurtmalar | Sarlavhada balans, "Yangi / Mening ishlarim / Tarix", filtr (5 km gacha, Naqd, Karta/QR), bepul oy banneri, buyurtma kartalari |
| BJ2 | Qabul qilish | Buyurtma, tafsilotlar (to‘liq manzil qabul qilishdan oldin ham ko‘rinadi), hisob-kitob (xizmat haqi 2.5%, "avval demodan"), "Balans yetarli", "Buyurtmani qabul qilish" |
| BJ3 | Mablag‘ yetarli emas | Bottom sheet: "Yana {N} so‘m to‘ldiring", hisobda bo‘lishi kerak / bor / yetishmaydi, summa chiplari, "to‘ldirish" |
| BJ4 | To‘lovni qabul qilish | "Ishni tugatdim"dan keyin ochiladi: QR-kod, taymer, summa, "Naqd pulni qabul qildim" |
| BJ5 | Hamyon | Jami balans, asosiy hisob va demo bonus, "To‘ldirish", "Pul yechish", tarix |
| BJ6 | Hisobni to‘ldirish | Summa, chiplar, balans oldin va keyin, to‘lov usuli (Click, Payme, Uzcard/Humo, Visa/Mastercard) |
| BJ7 | Pul yechish | Balans, band qilingan xizmat haqi, bank o‘tkazma xizmati 1% (platforma olmaydi), xato xabari, karta |
| BJ8 | Bepul oy tugadi | 2 ta soliq usuli (o‘zini o‘zi band, Paynet Xolis), 500 000 so‘mlik misol |
| BJ9 | Hujjat tasdiqlandi | Maqom, amal qilish muddati, "GTM soliq ushlamaydi", eslatma kaliti |
| BJ10 | Paynet Xolis’ni ulash | Xolis’da ro‘yxatdan o‘tish, QR-kodni ulash (skaner yoki rasm), telefon, tekshiruv |
| BJ11 | Yo‘lga chiqish | "Yo‘lga chiqyapsizmi?", 3 ta kafolat, "Ha, yo‘lga chiqdim", "Hali emas" |
| BJ12 | Manzilga yo‘l | Xarita va marshrut, "Joylashuvingiz mijozga ko‘rinmoqda", aniq manzil, "Google Maps’da ochish", "Yetib keldim" |

### 3.4. Umumiy

| ID | Nomi | Asosiy elementlar |
|---|---|---|
| U1 | Bosh menyu | Profil, joriy rol, "Buyurtmachiga o‘tish", hamyon, referal, sozlamalar, til, tungi rejim, yordam, chiqish |
| U2 | Referal dasturi | 1-qatlam 0.25%, 2-qatlam 0.12% (bepul oyda ham, platforma hisobidan), jami bonus, taklif havolasi, oxirgi bonuslar |
| U3 | Sozlamalar | Ko‘rinish (Kunduzgi/Tungi/Avto), til, matn o‘lchami, rolni almashtirish, soliq holati, bildirishnomalar, yordam |
| U4 | Bosh menyu 4 tilda | Bir menyuning 4 tildagi namunasi (matn uzunligini tekshirish uchun) |

### 3.5. Admin

| ID | Nomi | Asosiy elementlar |
|---|---|---|
| AD1 | Admin paneli | Bo‘limlar, bugungi vazifalar (hujjat murojaatlari, shikoyatlar, moderatsiya, yordam chatlari), statistika, "Ruxsat so‘rash" |
| AD2 | Foydalanuvchilar | Filtrlar, "Tekshiruv kutilmoqda", "Tasdiqlash" / "Rad etish" |
| AD3 | Shikoyatni ko‘rib chiqish | Tomonlarning fikri, "To‘lov to‘xtatilgan", qaror (to‘liq, 50%, bekor), "Super admin tasdiqlaydi" |

### 3.6. Super admin

| ID | Nomi | Asosiy elementlar |
|---|---|---|
| SA1 | Boshqaruv paneli | Davr, platforma sof daromadi va taqsimoti, demo ishlar referali (budjetdan), aylanma, bepul oydagi ustalar, foydalanuvchilar, demo komissiya, bo‘limlar |
| SA2 | Komissiya va to‘lovlar | Foizlar, soliq usullari, pul yechish xizmati, bepul davr, demo bonus, ish olish sharti, to‘lov usullari |
| SA3 | Rollar va ruxsatlar | Adminlar ro‘yxati, ruxsat kalitlari (biznes qoidalar §1) |
| SA4 | Moliya | Jami ko‘rsatkichlar (komissiya, referal, demo ishlar referali, platforma sof), buyurtmalar bo‘yicha taqsimot |
| SA5 | Soliq usullari | 2 usul (yoqish/o‘chirish), tanlagan ustalar soni, "Usul tanlamagan" va "Eslatma yuborish" |
| SA6 | Xarita va joylashuv | Google Maps Platform holati, API kalit, oylik bepul limit, yangilanish oralig‘i, avtomatik to‘xtash, "Manzil ish olinishidan oldin ko‘rinadi", maxfiylik |

### 3.7. Naqd va Xolis to‘lovini tasdiqlash

| ID | Nomi | Asosiy elementlar |
|---|---|---|
| BY9 | «To‘ladim» | "Usta ishni tugatdi", summa va "Naqd" belgisi, 3 qadam, "«To‘ladim»ni bosmaguningizcha yangi buyurtma joylay olmaysiz", "To‘ladim — {summa}", "Muammo bor" |
| BY10 | Yangi buyurtma yopiq | Yangi buyurtma ustidan bottom sheet: "Avval oldingi buyurtmani yoping", kutilayotgan buyurtma kartasi, "To‘ladim — {summa}", "Muammo bor" |
| BJ13 | «Pulni qabul qildim» | "Mijoz «To‘ladim»ni bosdi", hisob-kitob (olingan pul, xizmat haqi 2.5% hisobdan, sof daromad), balans oldin va keyin, "Pulni qabul qildim", "Pul kelmadi" |
| BJ14 | Yangi ish yopiq | Yangi ish ustidan bottom sheet: "Avval to‘lovni tasdiqlang", kutilayotgan ish kartasi, xizmat haqi avtomatik yechilishi, "Pulni qabul qildim", "Pul kelmadi" |

## 4. Hali chizilmagan ekranlar

Bu ekranlarni ham shu uslubda qiling:

- Kirish (telefon + parol) va parolni tiklash.
- K2’ning havolasiz holati: "Taklif kodi" maydoni (majburiy), kod noto‘g‘ri bo‘lsa xato.
- Buyurtmachi hamyoni: to‘ldirish va pul yechish.
- Usta: "Mening ishlarim" ro‘yxati, "Ishni boshladim", "Ishni tugatdim" (rasm bilan).
- Baholash (buyurtmachi ustaga, usta buyurtmachiga).
- Buyurtmani bekor qilish (sabab tanlash).
- Bildirishnomalar ro‘yxati.
- Buyurtmachining shikoyat yozish oynasi.
- Usta profili (kategoriyalar) va karta qo‘shish.
