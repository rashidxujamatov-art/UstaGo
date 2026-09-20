import React, { useState, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { AppContext } from '../context/AppContext';

// 1. SPLASH SCREEN
export const SplashScreen = ({ navigation }) => {
  return (
    <View style={styles.splashContainer}>
      <View style={styles.logoBadge}>
        <Text style={{ fontSize: 44 }}>⚡</Text>
      </View>
      <Text style={styles.splashTitle}>UstaGo</Text>
      <Text style={styles.splashSubtitle}>Xizmatlar va Ishlar Platformasi</Text>
      
      <TouchableOpacity 
        style={styles.splashBtn}
        onPress={() => navigation.navigate('Language')}>
        <Text style={styles.splashBtnText}>Boshlash ➔</Text>
      </TouchableOpacity>
    </View>
  );
};

// 2. LANGUAGE SCREEN
export const LanguageScreen = ({ navigation }) => {
  const { language, setLanguage } = useContext(AppContext);

  const languages = [
    { code: 'uz', name: 'O\'zbekcha (Lotin)', icon: '🇺🇿' },
    { code: 'ru', name: 'Русский', icon: '🇷🇺' },
    { code: 'en', name: 'English', icon: '🇬🇧' },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.headerStep}>1 / 5 Bosqich</Text>
      <Text style={styles.title}>Ilova tilini tanlang</Text>
      <Text style={styles.subtitle}>O'zingizga qulay va mos tilni belgilang</Text>

      {languages.map(lang => (
        <TouchableOpacity 
          key={lang.code}
          style={[styles.card, language === lang.name && styles.cardSelected]}
          onPress={() => setLanguage(lang.name)}>
          <Text style={{ fontSize: 26, marginRight: 14 }}>{lang.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{lang.name}</Text>
          </View>
          {language === lang.name && <Text style={styles.checkmark}>✓</Text>}
        </TouchableOpacity>
      ))}

      <View style={styles.footer}>
        <TouchableOpacity style={styles.btnPrimary} onPress={() => navigation.navigate('RoleSelect')}>
          <Text style={styles.btnPrimaryText}>Davom etish ➔</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// 3. ROLE SELECT SCREEN
export const RoleSelectScreen = ({ navigation }) => {
  const { userRole, setUserRole } = useContext(AppContext);

  return (
    <View style={styles.container}>
      <Text style={styles.headerStep}>2 / 5 Bosqich</Text>
      <Text style={styles.title}>Rolingizni tanlang</Text>
      <Text style={styles.subtitle}>Siz UstaGo'dan qanday foydalanmoqchisiz?</Text>

      <TouchableOpacity 
        style={[styles.card, userRole === 'Buyurtmachi' && styles.cardSelected]}
        onPress={() => setUserRole('Buyurtmachi')}>
        <View style={[styles.iconBg, { backgroundColor: '#D1FAE5' }]}>
          <Text style={{ fontSize: 24 }}>📋</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Buyurtmachiman</Text>
          <Text style={styles.cardDesc}>Ish joylayman va usta topaman.</Text>
        </View>
        {userRole === 'Buyurtmachi' && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.card, userRole === 'Bajaruvchi' && styles.cardSelected]}
        onPress={() => setUserRole('Bajaruvchi')}>
        <View style={[styles.iconBg, { backgroundColor: '#DBEAFE' }]}>
          <Text style={{ fontSize: 24 }}>🧰</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Bajaruvchiman (Ustaman)</Text>
          <Text style={styles.cardDesc}>Mavjud ishlarga taklif beraman.</Text>
        </View>
        {userRole === 'Bajaruvchi' && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.btnPrimary} onPress={() => navigation.navigate('Register')}>
          <Text style={styles.btnPrimaryText}>Davom etish ➔</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// 4. REGISTER SCREEN
export const RegisterScreen = ({ navigation }) => {
  const { phone, setPhone } = useContext(AppContext);
  const [email, setEmail] = useState('');

  return (
    <View style={styles.container}>
      <Text style={styles.headerStep}>3 / 5 Bosqich</Text>
      <Text style={styles.title}>Ro'yxatdan o'tish</Text>
      <Text style={styles.subtitle}>SMS tasdiqlash kodini yuboramiz</Text>

      <Text style={styles.inputLabel}>Telefon raqamingiz *</Text>
      <TextInput 
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="+998 (90) 000-00-00"
      />

      <Text style={styles.inputLabel}>Email manzil (Ixtiyoriy)</Text>
      <TextInput 
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        placeholder="nomi@mail.com"
      />

      <View style={styles.footer}>
        <TouchableOpacity style={styles.btnPrimary} onPress={() => navigation.navigate('Otp')}>
          <Text style={styles.btnPrimaryText}>SMS kodni olish ➔</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// 5. OTP SCREEN
export const OtpScreen = ({ navigation }) => {
  const { phone } = useContext(AppContext);
  const [otp, setOtp] = useState(['7', '7', '7', '7']);

  const handleVerify = () => {
    navigation.navigate('SuccessBonus');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerStep}>4 / 5 Bosqich</Text>
      <Text style={styles.title}>SMS kodni kiriting</Text>
      <Text style={styles.subtitle}>Kod {phone} raqamiga yuborildi</Text>

      <View style={styles.otpRow}>
        {otp.map((digit, idx) => (
          <View key={idx} style={styles.otpBox}>
            <Text style={styles.otpText}>{digit}</Text>
          </View>
        ))}
      </View>

      <Text style={{ textAlign: 'center', color: colors.textMuted, marginVertical: 16 }}>
        Qayta kod yuborish: <Text style={{ color: colors.accentDark, fontWeight: '700' }}>00:54</Text>
      </Text>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.btnPrimary} onPress={handleVerify}>
          <Text style={styles.btnPrimaryText}>Tasdiqlash ➔</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// 6. SUCCESS BONUS SCREEN
export const SuccessBonusScreen = ({ navigation }) => {
  return (
    <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', textAlign: 'center' }]}>
      <View style={styles.successBadge}>
        <Text style={{ fontSize: 38, color: '#10B981' }}>✓</Text>
      </View>
      <Text style={[styles.title, { textAlign: 'center' }]}>Tabriklaymiz!</Text>
      <Text style={[styles.subtitle, { textAlign: 'center' }]}>Siz muvaffaqiyatli ro'yxatdan o'tdingiz</Text>

      <View style={styles.bonusCard}>
        <Text style={styles.bonusTag}>🎁 STARTER BONUS</Text>
        <Text style={styles.bonusAmount}>10 000 SO'M</Text>
        <Text style={{ color: '#FFFFFF', opacity: 0.9, textAlign: 'center', fontSize: 13 }}>
          Hisobingizga starter bonus biriktirildi. Ilk xizmatlar uchun ishlatishingiz mumkin!
        </Text>
      </View>

      <TouchableOpacity 
        style={[styles.btnPrimary, { width: '100%', marginTop: 24 }]} 
        onPress={() => navigation.navigate('MainApp')}>
        <Text style={styles.btnPrimaryText}>Asosiy ilovaga o'tish ➔</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  splashContainer: { flex: 1, backgroundColor: colors.primaryDark, justifyContent: 'center', alignItems: 'center', padding: 20 },
  logoBadge: { width: 88, height: 88, borderRadius: 26, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  splashTitle: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', marginBottom: 6 },
  splashSubtitle: { fontSize: 14, color: '#94A3B8', marginBottom: 40 },
  splashBtn: { width: 220, height: 52, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  splashBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  headerStep: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '800', color: colors.textMain, marginBottom: 6 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginBottom: 20 },
  card: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 16, padding: 18, marginBottom: 14, flexDirection: 'row', alignItems: 'center' },
  cardSelected: { borderColor: colors.primaryLight, backgroundColor: '#EFF6FF' },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.textMain },
  cardDesc: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  iconBg: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  checkmark: { fontSize: 18, fontWeight: 'bold', color: colors.primaryLight },
  inputLabel: { fontSize: 13, fontWeight: '600', color: colors.textMain, marginBottom: 6, marginTop: 12 },
  input: { height: 52, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, fontSize: 15, color: colors.textMain },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 20 },
  otpBox: { width: 52, height: 58, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primaryLight, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  otpText: { fontSize: 24, fontWeight: '700', color: colors.textMain },
  successBadge: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#D1FAE5', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  bonusCard: { backgroundColor: colors.accentDark, borderRadius: 20, padding: 22, width: '100%', alignItems: 'center', marginVertical: 16 },
  bonusTag: { backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, color: '#FFFFFF', fontSize: 11, fontWeight: '700', marginBottom: 8 },
  bonusAmount: { fontSize: 30, fontWeight: '900', color: '#FFFFFF', marginBottom: 6 },
  footer: { marginTop: 'auto', paddingTop: 20 },
  btnPrimary: { height: 52, backgroundColor: colors.primaryLight, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  btnPrimaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' }
});
