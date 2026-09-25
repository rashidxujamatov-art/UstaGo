const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '../data/database.json');

const initialDbData = {
  users: [
    {
      id: 'usr_1',
      phone: '+998901234567',
      email: 'akmal@example.com',
      name: 'Akmal Karimov',
      role: 'Buyurtmachi',
      balance: 10000,
      rating: 4.9,
      verified: true,
      createdAt: '2026-09-20T22:00:00Z'
    },
    {
      id: 'usr_2',
      phone: '+998917654321',
      email: 'jamshid@usta.uz',
      name: 'Jamshid Usta',
      role: 'Bajaruvchi',
      balance: 50000,
      rating: 4.9,
      verified: true,
      createdAt: '2026-09-20T22:00:00Z'
    }
  ],
  jobs: [
    {
      id: 'job_1',
      clientId: 'usr_1',
      clientName: 'Akmal Karimov',
      title: 'Kvartiraga santexnik xizmati kerak',
      category: 'Ta\'mirlash',
      budget: 250000,
      location: 'Toshkent, Chilonzor',
      description: 'Oshxona kranini almashtirish va quvurlarni tekshirish.',
      status: 'OPEN',
      offersCount: 3,
      createdAt: '2026-09-20T22:00:00Z'
    }
  ],
  offers: [],
  transactions: [
    {
      id: 'tx_starter_1',
      userId: 'usr_1',
      amount: 10000,
      type: 'STARTER_BONUS',
      provider: 'SYSTEM',
      status: 'SUCCESS',
      createdAt: '2026-09-20T22:00:00Z'
    }
  ],
  paymeTransactions: [],
  clickTransactions: []
};

function loadDb() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDbData, null, 2), 'utf-8');
    return initialDbData;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDbData, null, 2), 'utf-8');
    return initialDbData;
  }
}

function saveDb(data) {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = { loadDb, saveDb };
