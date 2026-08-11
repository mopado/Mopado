import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/contexts/AuthContext';
import { colors } from '@/src/theme/colors';
import ConfirmModal from '@/src/components/ConfirmModal';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Team members editor state
  const [members, setMembers] = useState<string[]>([]);
  const [isSavingMembers, setIsSavingMembers] = useState(false);
  const [membersMsg, setMembersMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setMembers(user?.members && user.members.length > 0 ? [...user.members] : ['']);
  }, [user?.members]);

  const updateMember = (idx: number, value: string) => {
    setMembers((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  const addMember = () => {
    setMembers((prev) => [...prev, '']);
  };

  const removeMember = (idx: number) => {
    setMembers((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveMembers = async () => {
    if (!user?.id) return;
    setIsSavingMembers(true);
    setMembersMsg(null);
    try {
      const cleaned = members.map((m) => m.trim()).filter(Boolean);
      const r = await fetch(`${BACKEND_URL}/api/family/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: cleaned }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || 'Erreur lors de la sauvegarde');
      }
      await refreshUser();
      setMembersMsg({ type: 'ok', text: 'Prénoms enregistrés' });
      // Ensure the field shows at least one empty input if list is empty
      if (cleaned.length === 0) setMembers(['']);
      else setMembers(cleaned);
    } catch (e: any) {
      setMembersMsg({ type: 'err', text: e?.message || 'Erreur inconnue' });
    } finally {
      setIsSavingMembers(false);
      setTimeout(() => setMembersMsg(null), 3500);
    }
  };

  const handleLogoutPress = () => {
    setShowLogoutModal(true);
  };

  const handleLogoutConfirm = async () => {
    setShowLogoutModal(false);
    try {
      await logout();
      router.replace('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleLogoutCancel = () => {
    setShowLogoutModal(false);
  };

  const handleDeletePress = () => {
    setDeleteError('');
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!user?.id) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      const response = await fetch(`${BACKEND_URL}/api/family/${user.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Suppression impossible');
      }
      setShowDeleteModal(false);
      await logout();
      router.replace('/');
    } catch (e: any) {
      setDeleteError(e?.message || 'Erreur inconnue');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setDeleteError('');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            <Ionicons name="people" size={48} color={colors.textWhite} />
          </View>
          <Text style={styles.familyName}>Famille {user?.family_name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        {/* Family Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations famille</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="people-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.infoLabel}>Nombre d'enfants</Text>
              <Text style={styles.infoValue}>{user?.nb_children}</Text>
            </View>
            {user?.children_ages && user.children_ages.length > 0 && (
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.infoLabel}>Âges</Text>
                <Text style={styles.infoValue}>{user.children_ages.join(', ')} ans</Text>
              </View>
            )}
          </View>
        </View>

        {/* Équipe type — Members editor */}
        <View style={styles.section}>
          <View style={styles.membersHeader}>
            <Text style={styles.sectionTitle}>Équipe type</Text>
            <Ionicons name="people-circle" size={24} color={colors.primary} />
          </View>
          <Text style={styles.membersHint}>
            Ajoutez les prénoms des membres de la famille. Ils apparaîtront sur le Mur familial.
          </Text>
          <View style={styles.membersCard}>
            {members.map((name, idx) => (
              <View key={idx} style={styles.memberRow}>
                <View style={styles.memberIndex}>
                  <Text style={styles.memberIndexText}>{idx + 1}</Text>
                </View>
                <TextInput
                  style={styles.memberInput}
                  placeholder="Prénom"
                  placeholderTextColor={colors.textSecondary}
                  value={name}
                  onChangeText={(v) => updateMember(idx, v)}
                  autoCapitalize="words"
                  returnKeyType="done"
                  maxLength={30}
                  testID={`member-input-${idx}`}
                />
                <TouchableOpacity
                  onPress={() => removeMember(idx)}
                  style={styles.memberRemoveBtn}
                  disabled={members.length <= 1 && !name}
                  testID={`member-remove-${idx}`}
                >
                  <Ionicons
                    name="close-circle"
                    size={24}
                    color={members.length <= 1 && !name ? colors.textSecondary : colors.error}
                  />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              style={styles.memberAddBtn}
              onPress={addMember}
              testID="member-add"
            >
              <Ionicons name="add-circle" size={20} color={colors.primary} />
              <Text style={styles.memberAddBtnText}>Ajouter un prénom</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.memberSaveBtn, isSavingMembers && { opacity: 0.6 }]}
              onPress={saveMembers}
              disabled={isSavingMembers}
              testID="member-save"
            >
              <Ionicons name="save" size={18} color={colors.textWhite} />
              <Text style={styles.memberSaveBtnText}>
                {isSavingMembers ? 'Sauvegarde...' : 'Enregistrer'}
              </Text>
            </TouchableOpacity>
            {membersMsg ? (
              <Text
                style={[
                  styles.membersMsg,
                  { color: membersMsg.type === 'ok' ? colors.success : colors.error },
                ]}
              >
                {membersMsg.text}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Statistiques</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <View style={styles.statIconContainer}>
                <Ionicons name="cash" size={24} color={colors.primary} />
              </View>
              <Text style={styles.statValue}>{user?.mopado_dollars || 0}</Text>
              <Text style={styles.statLabel}>Mopado$</Text>
            </View>
            <View style={styles.statItem}>
              <View style={styles.statIconContainer}>
                <Ionicons name="medal" size={24} color={colors.gold} />
              </View>
              <Text style={styles.statValue}>{user?.badges?.length || 0}</Text>
              <Text style={styles.statLabel}>Badges</Text>
            </View>
            <View style={styles.statItem}>
              <View style={styles.statIconContainer}>
                <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              </View>
              <Text style={styles.statValue}>{user?.completed_episodes?.length || 0}</Text>
              <Text style={styles.statLabel}>Épisodes terminés</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="settings-outline" size={24} color={colors.text} />
            <Text style={styles.actionButtonText}>Paramètres</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="help-circle-outline" size={24} color={colors.text} />
            <Text style={styles.actionButtonText}>Aide & Support</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="information-circle-outline" size={24} color={colors.text} />
            <Text style={styles.actionButtonText}>À propos de Mopado</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity 
          style={styles.logoutButton} 
          onPress={handleLogoutPress}
          testID="logout-button"
        >
          <Ionicons name="log-out-outline" size={24} color={colors.error} />
          <Text style={styles.logoutButtonText}>Déconnexion</Text>
        </TouchableOpacity>

        {/* Delete Account Button */}
        <TouchableOpacity
          style={styles.deleteAccountButton}
          onPress={handleDeletePress}
          testID="delete-account-button"
        >
          <Ionicons name="trash-outline" size={20} color={colors.textWhite} />
          <Text style={styles.deleteAccountText}>Supprimer mon compte</Text>
        </TouchableOpacity>

        {/* App Version */}
        <Text style={styles.version}>Mopado v1.0.0</Text>
      </ScrollView>

      <ConfirmModal
        visible={showLogoutModal}
        title="Déconnexion"
        message="Êtes-vous sûr de vouloir vous déconnecter ?"
        confirmText="Déconnexion"
        cancelText="Annuler"
        onConfirm={handleLogoutConfirm}
        onCancel={handleLogoutCancel}
        isDestructive={true}
      />

      <ConfirmModal
        visible={showDeleteModal}
        title="Supprimer mon compte"
        message={
          deleteError
            ? `Erreur : ${deleteError}\n\nRéessayez ?`
            : "Cette action est irréversible. Vous perdrez définitivement votre compte, vos Mopado$, badges et l'historique de vos mots de fin. Confirmer ?"
        }
        confirmText={isDeleting ? 'Suppression...' : 'Supprimer'}
        cancelText="Annuler"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        isDestructive={true}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundTertiary,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    paddingVertical: 24,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  familyName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoLabel: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    marginLeft: 12,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  actionButtonText: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    marginLeft: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.error,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
    marginLeft: 8,
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  deleteAccountText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textWhite,
    marginLeft: 8,
  },
  version: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 24,
    marginBottom: 16,
  },
  membersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  membersHint: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  membersCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 14,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  memberIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberIndexText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  memberInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.backgroundTertiary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  memberRemoveBtn: {
    padding: 4,
  },
  memberAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  memberAddBtnText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  memberSaveBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
  },
  memberSaveBtnText: {
    color: colors.textWhite,
    fontWeight: '700',
    fontSize: 15,
  },
  membersMsg: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
});