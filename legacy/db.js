const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'database.json');

// Default initial data
const initialData = {
  users: [
    {
      id: 'usr_1',
      phone: '+998 90 123-45-67',
      email: 'akmal@example.com',
      name: 'Akmal Karimov',
      role: 'Buyurtmachi',
      balance: 10000,
      rating: 4.9
    },
    {
      id: 'usr_2',
      phone: '+998 91 765-43-21',
      email: 'jamshid@usta.uz',
      name: 'Jamshid (Usta)',
      role: 'Bajaruvchi',
      balance: 50000,
      rating: 4.9
    }
  ],
  categories: [
    { id: 'cat_1', name: "Ta'mirlash", icon: '🛠️' },
    { id: 'cat_2', name: 'Maishiy', icon: '🧹' },
    { id: 'cat_3', name: 'IT & Dizayn', icon: '💻' },
    { id: 'cat_4', name: 'Avto', icon: '🚗' },
    { id: 'cat_5', name: 'Logistika', icon: '🚚' },
    { id: 'cat_6', name: "Ta'lim", icon: '📚' },
    { id: 'cat_7', name: 'Foto/Video', icon: '📷' }
  ],
  jobs: [
    {
      id: 'job_1',
      clientId: 'usr_1',
      clientName: 'Akmal Karimov',
      title: 'Kvartiraga santexnik xizmati kerak',
      category: "Ta'mirlash",
      budget: 250000,
      location: 'Toshkent, Chilonzor',
      description: 'Oshxona kranini almashtirish va quvurlarni tekshirish kerak. Bajarish muddati bugun.',
      status: 'OPEN',
      offersCount: 3,
      createdAt: new Date().toISOString()
    },
    {
      id: 'job_2',
      clientId: 'usr_1',
      clientName: 'Akmal Karimov',
      title: 'Mobil ilova uchun UI/UX dizayn',
      category: 'IT & Dizayn',
      budget: 1200000,
      location: 'Masofadan (Remote)',
      description: 'Figma dasturida 5 ta mobil ekran dizaynini yaratish kerak. Muddati 3 kun.',
      status: 'OPEN',
      offersCount: 5,
      createdAt: new Date().toISOString()
    },
    {
      id: 'job_3',
      clientId: 'usr_3',
      clientName: 'Olimxon R.',
      title: 'Elektrik: Rozetkalarni ta\'mirlash',
      category: "Ta'mirlash",
      budget: 150000,
      location: 'Toshkent, Yunusobod (3.1 km)',
      description: 'Xonadonda 4 ta rozetka va lyustrani ulash lozim.',
      status: 'OPEN',
      offersCount: 1,
      createdAt: new Date().toISOString()
    }
  ],
  offers: [
    {
      id: 'off_1',
      jobId: 'job_1',
      workerId: 'usr_2',
      workerName: 'Jamshid (Usta)',
      workerRating: 4.9,
      price: 220000,
      comment: 'Bugun soat 15:00 da borib sifatli qilib beraman.',
      status: 'PENDING',
      createdAt: new Date().toISOString()
    }
  ],
  chats: [
    {
      id: 'chat_1',
      jobId: 'job_1',
      clientId: 'usr_1',
      workerId: 'usr_2',
      lastMessage: 'Assalomu alaykum! Narxini 220 000 so\'mga kelisha olamizmi?',
      updatedAt: new Date().toISOString()
    }
  ],
  messages: [
    {
      id: 'msg_1',
      chatId: 'chat_1',
      senderId: 'usr_2',
      senderName: 'Jamshid (Usta)',
      text: 'Salom! Santexnika e\'loningizni ko\'rdim. Bugun soat 15:00 da borib bera olaman.',
      createdAt: new Date().toISOString()
    },
    {
      id: 'msg_2',
      chatId: 'chat_1',
      senderId: 'usr_1',
      senderName: 'Akmal Karimov',
      text: 'Assalomu alaykum! Narxini 220 000 so\'mga kelisha olamizmi?',
      createdAt: new Date().toISOString()
    }
  ],
  reviews: []
};

// Load or Init DB
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    saveDB(initialData);
    return initialData;
  }
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Database file read error, recreating:', err);
    saveDB(initialData);
    return initialData;
  }
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { loadDB, saveDB };
