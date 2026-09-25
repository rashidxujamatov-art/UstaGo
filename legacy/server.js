const express = require('express');
const cors = require('cors');
const path = require('path');
const { loadDB, saveDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve Static Frontend Files
app.use(express.static(path.join(__dirname)));

// 1. Auth: Register
app.post('/api/auth/register', (req, res) => {
  const { phone, email, role } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Telefon raqam kiritilishi shart' });
  }

  const db = loadDB();
  let user = db.users.find(u => u.phone === phone);

  if (!user) {
    user = {
      id: 'usr_' + Date.now(),
      phone,
      email: email || '',
      name: phone,
      role: role || 'Buyurtmachi',
      balance: 10000, // 10,000 UZS Starter Bonus
      rating: 5.0,
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    saveDB(db);
  }

  res.json({ message: 'SMS OTP yuborildi', phone, userId: user.id });
});

// 2. Auth: Verify OTP
app.post('/api/auth/verify-otp', (req, res) => {
  const { phone, otp } = req.body;

  if (otp === '0000' || otp === '9999') {
    return res.status(400).json({ error: 'Kiritilgan SMS kod noto\'g\'ri' });
  }

  const db = loadDB();
  const user = db.users.find(u => u.phone === phone) || db.users[0];

  res.json({
    success: true,
    message: 'Registratsiya tasdiqlandi',
    bonusGranted: 10000,
    user
  });
});

// 3. Get Categories
app.get('/api/categories', (req, res) => {
  const db = loadDB();
  res.json(db.categories);
});

// 4. Jobs: Get all / filtered
app.get('/api/jobs', (req, res) => {
  const db = loadDB();
  const { category, role } = req.query;

  let jobs = db.jobs;
  if (category && category !== 'Barchasi') {
    jobs = jobs.filter(j => j.category === category);
  }

  res.json(jobs);
});

// 5. Jobs: Create Job (Buyurtmachi)
app.post('/api/jobs', (req, res) => {
  const { clientId, clientName, title, category, budget, location, description } = req.body;

  if (!title || !budget) {
    return res.status(400).json({ error: 'Topshiriq nomi va budjet kiritilishi shart' });
  }

  const db = loadDB();
  const newJob = {
    id: 'job_' + Date.now(),
    clientId: clientId || 'usr_1',
    clientName: clientName || 'Akmal Karimov',
    title,
    category: category || "Ta'mirlash",
    budget: Number(budget),
    location: location || 'Toshkent',
    description: description || 'Tafsilotlar ko\'rsatilmadi',
    status: 'OPEN',
    offersCount: 0,
    createdAt: new Date().toISOString()
  };

  db.jobs.unshift(newJob);
  saveDB(db);

  res.status(201).json(newJob);
});

// 6. Job Details & Offers
app.get('/api/jobs/:id', (req, res) => {
  const db = loadDB();
  const job = db.jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Topshiriq topilmadi' });

  const offers = db.offers.filter(o => o.jobId === req.params.id);
  res.json({ job, offers });
});

// 7. Offers: Create Bid (Bajaruvchi)
app.post('/api/jobs/:id/offers', (req, res) => {
  const { workerId, workerName, price, comment } = req.body;

  const db = loadDB();
  const job = db.jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Topshiriq topilmadi' });

  const newOffer = {
    id: 'off_' + Date.now(),
    jobId: req.params.id,
    workerId: workerId || 'usr_2',
    workerName: workerName || 'Jamshid (Usta)',
    workerRating: 4.9,
    price: Number(price) || job.budget,
    comment: comment || 'Sifatli va kafolatli bajaraman',
    status: 'PENDING',
    createdAt: new Date().toISOString()
  };

  db.offers.push(newOffer);
  job.offersCount = (job.offersCount || 0) + 1;
  saveDB(db);

  res.status(201).json(newOffer);
});

// 8. Offers: Accept Offer (Buyurtmachi)
app.post('/api/offers/:id/accept', (req, res) => {
  const db = loadDB();
  const offer = db.offers.find(o => o.id === req.params.id);
  if (!offer) return res.status(404).json({ error: 'Taklif topilmadi' });

  offer.status = 'ACCEPTED';
  const job = db.jobs.find(j => j.id === offer.jobId);
  if (job) job.status = 'IN_PROGRESS';

  saveDB(db);
  res.json({ message: 'Taklif qabul qilindi', offer });
});

// 9. Chats: Get conversations
app.get('/api/chats', (req, res) => {
  const db = loadDB();
  res.json(db.chats);
});

// 10. Messages: Get messages for chat
app.get('/api/chats/:id/messages', (req, res) => {
  const db = loadDB();
  const messages = db.messages.filter(m => m.chatId === req.params.id);
  res.json(messages);
});

// 11. Messages: Send message
app.post('/api/chats/:id/messages', (req, res) => {
  const { senderId, senderName, text } = req.body;
  if (!text) return res.status(400).json({ error: 'Xabar matni bo\'sh' });

  const db = loadDB();
  const newMessage = {
    id: 'msg_' + Date.now(),
    chatId: req.params.id,
    senderId: senderId || 'usr_1',
    senderName: senderName || 'Foydalanuvchi',
    text,
    createdAt: new Date().toISOString()
  };

  db.messages.push(newMessage);
  const chat = db.chats.find(c => c.id === req.params.id);
  if (chat) {
    chat.lastMessage = text;
    chat.updatedAt = new Date().toISOString();
  }

  saveDB(db);
  res.status(201).json(newMessage);
});

// 12. Complete Job & Submit Review
app.post('/api/jobs/:id/complete', (req, res) => {
  const { rating, comment } = req.body;

  const db = loadDB();
  const job = db.jobs.find(j => j.id === req.params.id);
  if (job) job.status = 'COMPLETED';

  const review = {
    id: 'rev_' + Date.now(),
    jobId: req.params.id,
    rating: rating || 5,
    comment: comment || 'A\'lo xizmat!',
    createdAt: new Date().toISOString()
  };

  db.reviews.push(review);
  saveDB(db);

  res.json({ message: 'Topshiriq yakunlandi va baholandi', review });
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`✅ Services Marketplace Backend server http://localhost:${PORT} portida ishga tushdi`);
});
