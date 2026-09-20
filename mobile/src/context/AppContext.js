import React, { createContext, useState } from 'react';

export const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [userRole, setUserRole] = useState('Buyurtmachi'); // 'Buyurtmachi' yoki 'Bajaruvchi'
  const [language, setLanguage] = useState('O\'zbekcha');
  const [phone, setPhone] = useState('+998 90 123-45-67');
  const [balance, setBalance] = useState(10000); // 10 000 UZS Starter Bonus
  const [jobs, setJobs] = useState([
    {
      id: 'job_1',
      title: 'Kvartiraga santexnik xizmati kerak',
      category: 'Ta\'mirlash',
      budget: 250000,
      location: 'Toshkent, Chilonzor',
      description: 'Oshxona kranini almashtirish va quvurlarni tekshirish.',
      offersCount: 3,
      status: 'OPEN'
    },
    {
      id: 'job_2',
      title: 'Mobil ilova uchun UI/UX dizayn',
      category: 'IT & Dizayn',
      budget: 1200000,
      location: 'Masofadan (Remote)',
      description: 'Figma dasturida 5 ta mobil ekran dizaynini yaratish.',
      offersCount: 5,
      status: 'OPEN'
    }
  ]);

  const addJob = (newJob) => {
    setJobs(prev => [newJob, ...prev]);
  };

  const topUpBalance = (amount) => {
    setBalance(prev => prev + amount);
  };

  return (
    <AppContext.Provider value={{
      userRole,
      setUserRole,
      language,
      setLanguage,
      phone,
      setPhone,
      balance,
      setBalance,
      jobs,
      addJob,
      topUpBalance
    }}>
      {children}
    </AppContext.Provider>
  );
};
