// App State
let state = {
  selectedLanguage: 'O\'zbekcha',
  userRole: 'Buyurtmachi', // 'Buyurtmachi' yoki 'Bajaruvchi'
  phone: '+998 90 123-45-67',
  email: 'akmal@example.com',
  balance: 10000,
  currentScreen: 'screen-splash',
  timerInterval: null,
  jobs: [
    {
      id: 'job_1',
      clientId: 'usr_1',
      clientName: 'Akmal Karimov',
      title: 'Kvartiraga santexnik xizmati kerak',
      category: 'Ta\'mirlash',
      budget: 250000,
      location: 'Toshkent, Chilonzor 7-mavze',
      description: 'Oshxona kranini almashtirish va quvurlarni tekshirish kerak. Muddati bugun.',
      status: 'OPEN',
      offersCount: 3
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
      offersCount: 5
    },
    {
      id: 'job_3',
      clientId: 'usr_3',
      clientName: 'Olimxon R.',
      title: 'Elektrik: Rozetkalarni ta\'mirlash',
      category: 'Ta\'mirlash',
      budget: 150000,
      location: 'Toshkent, Yunusobod (3.1 km)',
      description: 'Xonadonda 4 ta rozetka va lyustrani ulash lozim.',
      status: 'OPEN',
      offersCount: 1
    },
    {
      id: 'job_4',
      clientId: 'usr_4',
      clientName: 'Sardorbek M.',
      title: 'Kvartiradan mebellarni ko\'chirish',
      category: 'Logistika',
      budget: 400000,
      location: 'Toshkent, Sergeli 4-mavze',
      description: 'Mebellarni 3-qavatga olib chiqish kerak. Yuk mashinasi bilan.',
      status: 'OPEN',
      offersCount: 2
    }
  ]
};

// API Helper (Unified origin)
const API_URL = window.location.origin;

async function fetchAPI(endpoint, options = {}) {
  try {
    const res = await fetch(API_URL + endpoint, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    if (res.ok) return await res.json();
    return null;
  } catch (err) {
    return null;
  }
}

// Navigation
function navigateTo(screenId) {
  const current = document.querySelector('.screen.active');
  if (current) {
    current.classList.remove('active');
  }

  const next = document.getElementById(screenId);
  if (next) {
    next.classList.add('active');
    state.currentScreen = screenId;
  }

  // Status Bar theme update
  const statusBar = document.getElementById('statusBar');
  if (screenId === 'screen-splash') {
    statusBar.className = 'status-bar dark';
  } else {
    statusBar.className = 'status-bar light';
  }

  // Toggle Bottom Navigation visibility
  const bottomNav = document.getElementById('bottomNav');
  const mainScreens = ['screen-home', 'screen-feed', 'screen-chat', 'screen-profile'];
  if (mainScreens.includes(screenId)) {
    bottomNav.classList.add('active');
  } else {
    bottomNav.classList.remove('active');
  }
}

// Select Language
function selectLanguage(cardElement, langName) {
  state.selectedLanguage = langName;
  document.querySelectorAll('#screen-language .selection-card').forEach(c => c.classList.remove('selected'));
  cardElement.classList.add('selected');
}

// Select Role on Onboarding
function selectRole(role) {
  state.userRole = role;
  document.querySelectorAll('#screen-role .selection-card').forEach(c => c.classList.remove('selected'));
  if (role === 'Buyurtmachi') {
    document.getElementById('role-client').classList.add('selected');
  } else {
    document.getElementById('role-worker').classList.add('selected');
  }
}

// Submit Registration Form
async function submitRegistration() {
  const phone = document.getElementById('reg-phone').value;
  const email = document.getElementById('reg-email').value;

  if (email && !email.includes('@')) {
    document.getElementById('email-error').classList.add('active');
    return;
  } else {
    document.getElementById('email-error').classList.remove('active');
  }

  state.phone = phone;
  state.email = email;
  document.getElementById('display-phone').innerText = phone;

  navigateTo('screen-otp');
  startOtpTimer();
}

// OTP Timer
function startOtpTimer() {
  let seconds = 59;
  const timerText = document.getElementById('timer-text');
  
  if (state.timerInterval) clearInterval(state.timerInterval);

  state.timerInterval = setInterval(() => {
    seconds--;
    if (seconds >= 0) {
      timerText.innerText = `00:${seconds < 10 ? '0' : ''}${seconds}`;
    } else {
      clearInterval(state.timerInterval);
      timerText.innerText = 'Kodni qayta yuborish';
    }
  }, 1000);
}

// OTP Simulation: Error State
function simulateOtpError() {
  const otpBoxes = document.querySelectorAll('.otp-box');
  otpBoxes.forEach(box => box.classList.add('error'));
  document.getElementById('otp-error-msg').style.display = 'block';
}

// OTP Verification
function verifyOtp() {
  const otpBoxes = document.querySelectorAll('.otp-box');
  otpBoxes.forEach(box => box.classList.remove('error'));
  document.getElementById('otp-error-msg').style.display = 'none';

  navigateTo('screen-success');
}

// Enter Main App
function enterMainApp() {
  updateRoleUI();
  renderFeedJobs();
  navigateTo('screen-home');
}

// Dynamically Update Interface based on Role (BUYURTMACHI vs BAJARUVCHI)
function updateRoleUI() {
  const roleLabel = document.getElementById('current-role-label');
  const heroContainer = document.getElementById('home-hero-banner');
  const catTitle = document.getElementById('home-category-title');
  const catGrid = document.getElementById('home-category-grid');
  const listTitle = document.getElementById('home-list-title');
  const jobsContainer = document.getElementById('home-jobs-container');
  const btnClient = document.getElementById('btn-client-mode');
  const btnWorker = document.getElementById('btn-worker-mode');
  const profileRoleBadge = document.getElementById('profile-role-badge');
  const userBalanceText = document.getElementById('user-balance-text');
  const topWalletAmount = document.getElementById('top-wallet-amount');

  if (userBalanceText) userBalanceText.innerText = `${state.balance.toLocaleString()} UZS`;
  if (topWalletAmount) topWalletAmount.innerText = state.balance.toLocaleString();

  if (state.userRole === 'Buyurtmachi') {
    if (roleLabel) roleLabel.innerText = '📋 Buyurtmachi Rejimi';
    if (profileRoleBadge) profileRoleBadge.innerText = 'Buyurtmachi';
    
    if (heroContainer) {
      heroContainer.innerHTML = `
        <div style="background: linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%); color: white; padding: 18px; border-radius: 18px; margin-bottom: 20px; box-shadow: 0 6px 20px rgba(37, 99, 235, 0.25);">
          <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 4px;">Usta yoki mutaxassis kerakmi?</h3>
          <p style="font-size: 12px; opacity: 0.9; margin-bottom: 12px;">Topshiriq joylang va eng yaxshi ustani tanlang</p>
          <button class="btn-primary" style="height: 42px; font-size: 14px; background: #10B981; box-shadow: none;" onclick="openCreateModal()">
            + Yangi e'lon berish
          </button>
        </div>
      `;
    }

    if (catTitle) catTitle.innerHTML = 'Qanday xizmat kerak? <span style="font-size: 11px; color: var(--text-muted); font-weight: normal;">(E\'lon berish uchun bosing)</span>';

    if (catGrid) {
      catGrid.innerHTML = `
        <div class="category-item" onclick="openCreateModalWithCat('Ta\'mirlash')">
          <div class="category-icon">🛠️</div>
          <div class="category-name">Ta'mirlash</div>
        </div>
        <div class="category-item" onclick="openCreateModalWithCat('Maishiy')">
          <div class="category-icon">🧹</div>
          <div class="category-name">Maishiy</div>
        </div>
        <div class="category-item" onclick="openCreateModalWithCat('IT & Dizayn')">
          <div class="category-icon">💻</div>
          <div class="category-name">IT & Dizayn</div>
        </div>
        <div class="category-item" onclick="openCreateModalWithCat('Avto')">
          <div class="category-icon">🚗</div>
          <div class="category-name">Avto</div>
        </div>
        <div class="category-item" onclick="openCreateModalWithCat('Logistika')">
          <div class="category-icon">🚚</div>
          <div class="category-name">Logistika</div>
        </div>
        <div class="category-item" onclick="openCreateModalWithCat('Ta\'lim')">
          <div class="category-icon">📚</div>
          <div class="category-name">Ta'lim</div>
        </div>
        <div class="category-item" onclick="openCreateModalWithCat('Foto/Video')">
          <div class="category-icon">📷</div>
          <div class="category-name">Foto/Video</div>
        </div>
        <div class="category-item" onclick="openCreateModal()">
          <div class="category-icon">⚡</div>
          <div class="category-name">Barchasi</div>
        </div>
      `;
    }

    if (listTitle) listTitle.innerText = 'Mening e\'lonlarim (Aktiv)';

    if (jobsContainer) {
      const myJobs = state.jobs.filter(j => j.clientId === 'usr_1');
      jobsContainer.innerHTML = myJobs.map(job => `
        <div class="job-card" onclick="openJobDetail('${job.id}')">
          <div class="job-card-header">
            <div class="job-title">${job.title}</div>
            <div class="job-price">${job.budget.toLocaleString()} UZS</div>
          </div>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">${job.description}</p>
          <div class="job-meta">
            <span style="color: var(--accent-dark); font-weight: 700;">💬 ${job.offersCount || 0} ta usta taklif berdi</span>
            <span>📍 ${job.location}</span>
          </div>
        </div>
      `).join('');
    }

    if (btnClient && btnWorker) {
      btnClient.style.background = 'white';
      btnClient.style.color = 'var(--primary)';
      btnWorker.style.background = 'transparent';
      btnWorker.style.color = 'var(--text-muted)';
    }

  } else {
    // BAJARUVCHI (USTA / SPECIALIST) PERSPECTIVE
    if (roleLabel) roleLabel.innerText = '🧰 Bajaruvchi (Usta) Rejimi';
    if (profileRoleBadge) profileRoleBadge.innerText = 'Ustaman (Bajaruvchi)';

    if (heroContainer) {
      heroContainer.innerHTML = `
        <div style="background: linear-gradient(135deg, #059669 0%, #10B981 100%); color: white; padding: 18px; border-radius: 18px; margin-bottom: 20px; box-shadow: 0 6px 20px rgba(16, 185, 129, 0.25);">
          <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 4px;">Bo'sh ishlarni toping va ishlang!</h3>
          <p style="font-size: 12px; opacity: 0.9; margin-bottom: 12px;">Mavjud topshiriqlarga taklif yuboring hamda daromad qiling</p>
          <button class="btn-primary" style="height: 42px; font-size: 14px; background: #1E3A8A; box-shadow: none;" onclick="switchTab('feed')">
            🔍 Ishlarni ko'rish va taklif berish
          </button>
        </div>
      `;
    }

    if (catTitle) catTitle.innerHTML = 'Sohangiz bo\'yicha ishlarni filtrlash <span style="font-size: 11px; color: var(--accent-dark); font-weight: bold;">(Izlash)</span>';

    if (catGrid) {
      catGrid.innerHTML = `
        <div class="category-item" onclick="filterFeedCategory('Ta\'mirlash')">
          <div class="category-icon">🛠️</div>
          <div class="category-name">Ta'mirlash</div>
        </div>
        <div class="category-item" onclick="filterFeedCategory('Maishiy')">
          <div class="category-icon">🧹</div>
          <div class="category-name">Maishiy</div>
        </div>
        <div class="category-item" onclick="filterFeedCategory('IT & Dizayn')">
          <div class="category-icon">💻</div>
          <div class="category-name">IT & Dizayn</div>
        </div>
        <div class="category-item" onclick="filterFeedCategory('Avto')">
          <div class="category-icon">🚗</div>
          <div class="category-name">Avto</div>
        </div>
        <div class="category-item" onclick="filterFeedCategory('Logistika')">
          <div class="category-icon">🚚</div>
          <div class="category-name">Logistika</div>
        </div>
        <div class="category-item" onclick="filterFeedCategory('Ta\'lim')">
          <div class="category-icon">📚</div>
          <div class="category-name">Ta'lim</div>
        </div>
        <div class="category-item" onclick="filterFeedCategory('Foto/Video')">
          <div class="category-icon">📷</div>
          <div class="category-name">Foto/Video</div>
        </div>
        <div class="category-item" onclick="switchTab('feed')">
          <div class="category-icon">⚡</div>
          <div class="category-name">Barchasi</div>
        </div>
      `;
    }

    if (listTitle) listTitle.innerText = 'Yangi bo\'sh ishlar (Vakansiyalar)';

    if (jobsContainer) {
      jobsContainer.innerHTML = state.jobs.map(job => `
        <div class="job-card" onclick="openJobDetail('${job.id}')">
          <div class="job-card-header">
            <div class="job-title">${job.title}</div>
            <div class="job-price">${job.budget.toLocaleString()} UZS</div>
          </div>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">Buyurtmachi: ${job.clientName}</p>
          <div class="job-meta">
            <span>📍 ${job.location}</span>
            <span style="color: var(--accent-dark); font-weight: 700;">⚡ Taklif yuborish</span>
          </div>
        </div>
      `).join('');
    }

    if (btnClient && btnWorker) {
      btnWorker.style.background = 'white';
      btnWorker.style.color = 'var(--primary)';
      btnClient.style.background = 'transparent';
      btnClient.style.color = 'var(--text-muted)';
    }
  }
}

// Render Jobs Feed Screen
function renderFeedJobs(filterCat = 'Barchasi') {
  const container = document.getElementById('feed-jobs-container');
  if (!container) return;

  let list = state.jobs;
  if (filterCat !== 'Barchasi') {
    list = list.filter(j => j.category === filterCat);
  }

  container.innerHTML = list.map(job => `
    <div class="job-card" onclick="openJobDetail('${job.id}')">
      <div class="job-card-header">
        <div class="job-title">${job.title}</div>
        <div class="job-price">${job.budget.toLocaleString()} UZS</div>
      </div>
      <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">${job.description}</p>
      <div class="job-meta">
        <span>📍 ${job.location}</span>
        <span style="color: var(--primary-light); font-weight: 700;">💬 ${job.offersCount} ta taklif</span>
      </div>
    </div>
  `).join('');
}

function filterFeedCategory(catName, element) {
  if (element) {
    document.querySelectorAll('.chip-filter').forEach(c => c.classList.remove('active'));
    element.classList.add('active');
  }
  switchTab('feed');
  renderFeedJobs(catName);
}

// Open Job Detail
let currentSelectedJobId = 'job_1';
function openJobDetail(jobId) {
  currentSelectedJobId = jobId;
  const job = state.jobs.find(j => j.id === jobId) || state.jobs[0];

  document.getElementById('modal-title').innerText = job.title;
  document.getElementById('modal-price').innerText = `${job.budget.toLocaleString()} UZS`;
  document.getElementById('modal-desc').innerText = job.description;
  document.getElementById('modal-location').innerText = job.location;
  document.getElementById('modal-client').innerText = job.clientName;
  document.getElementById('modal-status-badge').innerText = job.status;

  const actionBtn = document.getElementById('modal-action-btn');
  if (state.userRole === 'Buyurtmachi') {
    actionBtn.innerText = '💬 Ustalar takliflarini ko\'rish va chatga o\'tish';
  } else {
    actionBtn.innerText = '⚡ Buyurtmachiga narx taklifi yuborish';
  }

  document.getElementById('modal-job-detail').classList.add('active');
}

function handleJobModalAction() {
  closeModal('modal-job-detail');
  switchTab('chat');
}

function acceptOffer(workerName) {
  closeModal('modal-job-detail');
  switchTab('chat');
  alert(`🎉 ${workerName} bilan kelishuv qabul qilindi! Chatda muloqotni davom ettirishingiz mumkin.`);
}

// Modal Handlers
function openCreateModalWithCat(categoryName) {
  document.getElementById('modal-create-job-cat').innerText = categoryName;
  document.getElementById('modal-create-job').classList.add('active');
}

function openCreateModal() {
  document.getElementById('modal-create-job-cat').innerText = 'Ta\'mirlash';
  document.getElementById('modal-create-job').classList.add('active');
}

function submitNewJob() {
  const title = document.getElementById('new-job-title').value;
  const desc = document.getElementById('new-job-desc').value;
  const budget = document.getElementById('new-job-budget').value;
  const category = document.getElementById('modal-create-job-cat').innerText;

  if (!title || !budget) {
    alert('Iltimos, topshiriq sarlavhasi va budjetni kiriting');
    return;
  }

  const newJob = {
    id: 'job_' + Date.now(),
    clientId: 'usr_1',
    clientName: 'Akmal Karimov',
    title,
    category,
    budget: Number(budget),
    location: 'Toshkent, Chilonzor',
    description: desc || 'Tafsilotlar ko\'rsatildi',
    status: 'OPEN',
    offersCount: 0
  };

  state.jobs.unshift(newJob);
  closeModal('modal-create-job');
  updateRoleUI();
  renderFeedJobs();
  alert('🎉 Yangi e\'lon muvaffaqiyatli chop etildi!');
}

// Hamyon Top-Up Modal
function openTopUpModal() {
  document.getElementById('modal-top-up').classList.add('active');
}

function selectPaymentMethod(elem) {
  document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('selected'));
  elem.classList.add('selected');
}

function processTopUp() {
  const amount = Number(document.getElementById('topup-amount-input').value) || 50000;
  state.balance += amount;
  updateRoleUI();
  closeModal('modal-top-up');
  alert(`💳 Muvaffaqiyatli! Hamyoningizga +${amount.toLocaleString()} UZS qo'shildi.`);
}

// Chat Functionality
function sendChatMessage() {
  const input = document.getElementById('chat-input-text');
  const text = input.value.trim();
  if (!text) return;

  const chatList = document.getElementById('chat-messages-list');
  
  const userMsg = document.createElement('div');
  userMsg.style.cssText = 'align-self: flex-end; max-width: 82%; background: var(--primary); color: white; padding: 12px 14px; border-radius: 16px 16px 4px 16px; font-size: 13px; line-height: 1.4;';
  userMsg.innerText = text;
  chatList.appendChild(userMsg);

  input.value = '';
  chatList.scrollTop = chatList.scrollHeight;

  // Auto Reply Simulation
  setTimeout(() => {
    const replyMsg = document.createElement('div');
    replyMsg.style.cssText = 'align-self: flex-start; max-width: 82%; background: white; padding: 12px 14px; border-radius: 16px 16px 16px 4px; border: 1px solid var(--border); font-size: 13px; line-height: 1.4;';
    replyMsg.innerText = "Tushunarli, tez orada yetib boraman va ishni yuqori darajada bajaraman! 👍";
    chatList.appendChild(replyMsg);
    chatList.scrollTop = chatList.scrollHeight;
  }, 1200);
}

// Rating Modal
function openRatingModal() {
  document.getElementById('modal-rating').classList.add('active');
}

function saveRating() {
  closeModal('modal-rating');
  alert('🎉 Rahmat! Baho va sharhingiz muvaffaqiyatli saqlandi.');
  switchTab('home');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Navigation Tab Switcher
function switchTab(tabName) {
  document.querySelectorAll('.bottom-nav .nav-item').forEach(item => item.classList.remove('active'));

  if (tabName === 'home') {
    navigateTo('screen-home');
    document.querySelectorAll('.bottom-nav .nav-item')[0].classList.add('active');
  } else if (tabName === 'feed') {
    navigateTo('screen-feed');
    document.querySelectorAll('.bottom-nav .nav-item')[1].classList.add('active');
  } else if (tabName === 'chat') {
    navigateTo('screen-chat');
    document.querySelectorAll('.bottom-nav .nav-item')[3].classList.add('active');
  } else if (tabName === 'profile') {
    navigateTo('screen-profile');
    document.querySelectorAll('.bottom-nav .nav-item')[4].classList.add('active');
  }
}

function toggleUserRole(role) {
  state.userRole = role;
  updateRoleUI();
}

function handleHomeSearch(val) {
  if (!val) {
    renderFeedJobs();
    return;
  }
  const filtered = state.jobs.filter(j => j.title.toLowerCase().includes(val.toLowerCase()) || j.category.toLowerCase().includes(val.toLowerCase()));
  const container = document.getElementById('home-jobs-container');
  if (container) {
    container.innerHTML = filtered.map(job => `
      <div class="job-card" onclick="openJobDetail('${job.id}')">
        <div class="job-card-header">
          <div class="job-title">${job.title}</div>
          <div class="job-price">${job.budget.toLocaleString()} UZS</div>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">${job.description}</p>
        <div class="job-meta">
          <span>📍 ${job.location}</span>
        </div>
      </div>
    `).join('');
  }
}

// System Time Clock
setInterval(() => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  const clock = document.getElementById('currentTime');
  if (clock) clock.innerText = `${hours}:${mins}`;
}, 1000);

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  renderFeedJobs();
});
