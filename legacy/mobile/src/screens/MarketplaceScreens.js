import React, { useContext, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Modal } from 'react-native';
import { colors } from '../theme/colors';
import { AppContext } from '../context/AppContext';

// HOME SCREEN
export const HomeScreen = ({ navigation }) => {
  const { userRole, balance, jobs, topUpBalance } = useContext(AppContext);
  const [topUpModalVisible, setTopUpModalVisible] = useState(false);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.avatar}><Text style={{ color: '#FFF', fontWeight: 'bold' }}>AK</Text></View>
          <View>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>Salom, Akmal 👋</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textMain }}>
              {userRole === 'Buyurtmachi' ? '📋 Buyurtmachi Rejimi' : '🧰 Bajaruvchi Rejimi'}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.walletBadge} onPress={() => setTopUpModalVisible(true)}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.accentDark }}>
            💳 {balance.toLocaleString()} UZS
          </Text>
        </TouchableOpacity>
      </View>

      {/* Hero Banner */}
      <View style={[styles.heroBanner, { backgroundColor: userRole === 'Buyurtmachi' ? colors.primaryLight : colors.accentDark }]}>
        <Text style={styles.heroTitle}>
          {userRole === 'Buyurtmachi' ? 'Usta yoki mutaxassis kerakmi?' : 'Bo\'sh ishlarni toping va ishlang!'}
        </Text>
        <Text style={styles.heroSubtitle}>
          {userRole === 'Buyurtmachi' ? 'Topshiriq joylang va eng yaxshi ustani tanlang' : 'Mavjud topshiriqlarga taklif yuboring'}
        </Text>
      </View>

      {/* Categories */}
      <Text style={styles.sectionTitle}>Qanday xizmat kerak?</Text>
      <View style={styles.catGrid}>
        {['🛠️ Ta\'mirlash', '🧹 Maishiy', '💻 IT & Dizayn', '🚗 Avto', '🚚 Logistika', '📚 Ta\'lim', '📷 Foto/Video', '⚡ Barchasi'].map((cat, idx) => (
          <TouchableOpacity key={idx} style={styles.catItem}>
            <View style={styles.catIcon}><Text style={{ fontSize: 22 }}>{cat.split(' ')[0]}</Text></View>
            <Text style={styles.catName}>{cat.split(' ')[1] || cat}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Jobs Feed Preview */}
      <Text style={styles.sectionTitle}>Aktiv topshiriqlar</Text>
      {jobs.map(job => (
        <TouchableOpacity key={job.id} style={styles.jobCard} onPress={() => navigation.navigate('Chat')}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={styles.jobTitle}>{job.title}</Text>
            <Text style={styles.jobPrice}>{job.budget.toLocaleString()} UZS</Text>
          </View>
          <Text style={styles.jobDesc}>{job.description}</Text>
          <Text style={styles.jobMeta}>📍 {job.location} • 💬 {job.offersCount} ta taklif</Text>
        </TouchableOpacity>
      ))}

      {/* Top-up Modal */}
      <Modal visible={topUpModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Hamyon balansi to'ldirish</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>Click / Payme to'lov tizimini tanlang</Text>
            
            <TouchableOpacity style={styles.btnPrimary} onPress={() => { topUpBalance(50000); setTopUpModalVisible(false); Alert.alert('💳 Muvaffaqiyatli', '+50 000 UZS qo\'shildi'); }}>
              <Text style={styles.btnPrimaryText}>+ 50 000 UZS to'ldirish (Click)</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: colors.border, marginTop: 10 }]} onPress={() => setTopUpModalVisible(false)}>
              <Text style={{ color: colors.textMain, fontWeight: '700' }}>Yopish</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
};

// PROFILE SCREEN
export const ProfileScreen = () => {
  const { userRole, setUserRole, balance } = useContext(AppContext);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mening Profilim</Text>
      
      <View style={styles.profileCard}>
        <View style={styles.avatarLg}><Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 20 }}>AK</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700' }}>Akmal Karimov ✓</Text>
          <Text style={{ fontSize: 12, color: colors.textMuted }}>+998 90 123-45-67</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#D97706', marginTop: 4 }}>⭐ 4.9 Reyting</Text>
        </View>
      </View>

      <View style={styles.roleToggleRow}>
        <TouchableOpacity 
          style={[styles.roleBtn, userRole === 'Buyurtmachi' && styles.roleBtnActive]}
          onPress={() => setUserRole('Buyurtmachi')}>
          <Text style={{ fontWeight: '700', color: userRole === 'Buyurtmachi' ? colors.primaryLight : colors.textMuted }}>📋 Buyurtmachi</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.roleBtn, userRole === 'Bajaruvchi' && styles.roleBtnActive]}
          onPress={() => setUserRole('Bajaruvchi')}>
          <Text style={{ fontWeight: '700', color: userRole === 'Bajaruvchi' ? colors.primaryLight : colors.textMuted }}>🧰 Bajaruvchi</Text>
        </TouchableOpacity>
      </View>

      <View style={{ gap: 10, marginTop: 20 }}>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={{ fontWeight: '600' }}>📋 Mening e'lonlarim hamda buyurtmalarim</Text>
          <Text style={{ color: colors.textMuted }}>➔</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={{ fontWeight: '600' }}>🛡️ Shaxsni tasdiqlash (Verification)</Text>
          <Text style={{ color: colors.accentDark, fontWeight: '700' }}>✓ Verified</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarLg: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  walletBadge: { backgroundColor: '#F0FDF4', borderBottomWidth: 1, borderColor: '#BBF7D0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  heroBanner: { borderRadius: 18, padding: 18, marginBottom: 20 },
  heroTitle: { fontSize: 16, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  heroSubtitle: { fontSize: 12, color: '#FFF', opacity: 0.9 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textMain, marginBottom: 12 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  catItem: { width: '22%', alignItems: 'center' },
  catIcon: { width: 54, height: 54, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  catName: { fontSize: 11, fontWeight: '600', color: colors.textMain, textAlign: 'center' },
  jobCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, marginBottom: 12 },
  jobTitle: { fontSize: 15, fontWeight: '700', color: colors.textMain, flex: 1 },
  jobPrice: { fontSize: 15, fontWeight: '800', color: colors.accentDark },
  jobDesc: { fontSize: 13, color: colors.textMuted, marginVertical: 6 },
  jobMeta: { fontSize: 12, color: colors.textMuted },
  profileCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  roleToggleRow: { backgroundColor: '#F1F5F9', borderRadius: 16, padding: 4, flexDirection: 'row' },
  roleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12 },
  roleBtnActive: { backgroundColor: '#FFFFFF' },
  menuItem: { backgroundColor: colors.surface, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  btnPrimary: { height: 50, backgroundColor: colors.primaryLight, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  btnPrimaryText: { color: '#FFF', fontWeight: '700', fontSize: 15 }
});
