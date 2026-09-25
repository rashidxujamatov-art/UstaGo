const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const { loadDb, saveDb } = require('./models/db');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Static Frontend if requested
app.use(express.static(path.join(__dirname, '../')));

// Auth Routes
app.use('/api/auth', authRoutes);

// Payment Routes (Click & Payme)
app.use('/api/payments', paymentRoutes);

// Jobs REST Routes
app.get('/api/jobs', (req, res) => {
  const db = loadDb();
  res.json(db.jobs);
});

app.post('/api/jobs', (req, res) => {
  const { clientId, clientName, title, category, budget, location, description } = req.body;

  if (!title || !budget) {
    return res.status(400).json({ error: 'Topshiriq sarlavhasi va budjet kiritilishi shart' });
  }

  const db = loadDb();
  const newJob = {
    id: 'job_' + Date.now(),
    clientId: clientId || 'usr_1',
    clientName: clientName || 'Akmal Karimov',
    title,
    category: category || "Ta'mirlash",
    budget: Number(budget),
    location: location || 'Toshkent, Chilonzor',
    description: description || 'Batafsil ma\'lumot berildi',
    status: 'OPEN',
    offersCount: 0,
    createdAt: new Date().toISOString()
  };

  db.jobs.unshift(newJob);
  saveDb(db);

  res.status(201).json(newJob);
});

app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'UstaGo Production Backend', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[OK] UstaGo Production Backend Server http://localhost:${PORT} portida ishga tushdi`);
});
