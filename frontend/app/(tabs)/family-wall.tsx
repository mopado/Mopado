import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/contexts/AuthContext';
import { colors } from '@/src/theme/colors';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface ClosingWord {
  date: string;
  episode_title: string;
  closing_word: string;
}

interface ProgressData {
  mopado_dollars: number;
  badges: string[];
  completed_episodes: string[];
  closing_words_history: ClosingWord[];
  total_sessions: number;
  completed_seasons: number;
}

export default function FamilyWallScreen() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);

  // Reload every time the tab gains focus AND when user is available.
  useFocusEffect(
    useCallback(() => {
      loadProgressData();
    }, [user?.id])
  );

  const loadProgressData = async () => {
    if (!user?.id) {
      // Still no user hydrated — stop the spinner so we don't hang forever.
      setIsLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      await refreshUser();
      const response = await fetch(`${BACKEND_URL}/api/progress/${user.id}`);
      if (response.ok) {
        const data = await response.json();
        setProgressData(data);
      }
    } catch (error) {
      console.error('Error loading progress:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadProgressData();
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Mur Familial</Text>
          <Text style={styles.headerSubtitle}>Vos souvenirs et récompenses</Text>
        </View>
        <TouchableOpacity
          style={styles.teamBtn}
          onPress={() => setShowTeamModal(true)}
          testID="team-button"
        >
          <Ionicons name="people" size={16} color={colors.textWhite} />
          <Text style={styles.teamBtnText}>Équipe type</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Stats Cards */}
        <View style={styles.statsSection}>
          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="cash" size={32} color={colors.primary} />
            </View>
            <Text style={styles.statValue}>
              {progressData?.mopado_dollars || 0}
            </Text>
            <Text style={styles.statLabel}>Mopado$ cumulés</Text>
            <Text style={styles.statHint}>
              À venir : échangez-les contre des récompenses
            </Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="medal" size={32} color={colors.gold} />
            </View>
            <Text style={styles.statValue}>
              {progressData?.badges?.length || 0}
            </Text>
            <Text style={styles.statLabel}>Badges obtenus</Text>
          </View>
        </View>

        <View style={styles.statsSection}>
          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="checkmark-circle" size={32} color={colors.success} />
            </View>
            <Text style={styles.statValue}>
              {progressData?.completed_episodes?.length || 0}
            </Text>
            <Text style={styles.statLabel}>Épisodes terminés</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="library" size={32} color={colors.secondary} />
            </View>
            <Text style={styles.statValue}>
              {progressData?.completed_seasons || 0}
            </Text>
            <Text style={styles.statLabel}>Saisons terminées</Text>
          </View>
        </View>

        {/* Badges Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Badges obtenus</Text>
          {progressData?.badges && progressData.badges.length > 0 ? (
            <View style={styles.badgesContainer}>
              {progressData.badges.map((badge, index) => (
                <View key={index} style={styles.badgeItem}>
                  <View style={styles.badgeIcon}>
                    <Ionicons name="medal" size={32} color={colors.gold} />
                  </View>
                  <Text style={styles.badgeName}>{badge}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptySection}>
              <Ionicons name="medal-outline" size={48} color={colors.textSecondary} />
              <Text style={styles.emptyText}>Aucun badge obtenu</Text>
              <Text style={styles.emptySubtext}>
                Continuez à participer pour gagner des badges !
              </Text>
            </View>
          )}
        </View>

        {/* Closing Words History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mots de fin</Text>
          {progressData?.closing_words_history &&
          progressData.closing_words_history.length > 0 ? (
            <View style={styles.closingWordsContainer}>
              {progressData.closing_words_history.map((item, index) => {
                let formattedDate = '';
                try {
                  formattedDate = format(new Date(item.date), 'dd MMMM yyyy', {
                    locale: fr,
                  });
                } catch (e) {
                  formattedDate = item.date;
                }

                return (
                  <View key={index} style={styles.closingWordCard}>
                    <View style={styles.closingWordHeader}>
                      <Ionicons name="heart" size={20} color={colors.accent} />
                      <Text style={styles.closingWordDate}>{formattedDate}</Text>
                    </View>
                    <Text style={styles.closingWordEpisode}>
                      {item.episode_title}
                    </Text>
                    <View style={styles.closingWordContent}>
                      <Text style={styles.closingWordQuote}>“</Text>
                      <Text style={styles.closingWordText}>
                        {item.closing_word}
                      </Text>
                      <Text style={styles.closingWordQuote}>”</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptySection}>
              <Ionicons name="chatbox-ellipses-outline" size={48} color={colors.textSecondary} />
              <Text style={styles.emptyText}>Aucun mot de fin</Text>
              <Text style={styles.emptySubtext}>
                Vos mots de fin apparaîtront ici après chaque session
              </Text>
            </View>
          )}
        </View>

        {/* Motivational Message */}
        <View style={styles.motivationCard}>
          <Ionicons name="heart-circle" size={32} color={colors.primary} />
          <Text style={styles.motivationText}>
            Chaque moment passé ensemble est un souvenir précieux. Continuez à créer ces moments en famille !
          </Text>
        </View>
      </ScrollView>

      {/* Équipe type modal */}
      <Modal
        visible={showTeamModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTeamModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Ionicons name="people-circle" size={26} color={colors.primary} />
                <Text style={styles.modalTitle}>Équipe type</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowTeamModal(false)}
                testID="team-close"
              >
                <Ionicons name="close" size={28} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.teamFamilyName}>
              Famille {user?.family_name}
            </Text>

            {user?.members && user.members.length > 0 ? (
              <>
                <Text style={styles.teamHint}>
                  Les joueurs qui font vibrer les Mopado ensemble.
                </Text>
                <View style={styles.teamGrid}>
                  {user.members.map((name, idx) => {
                    const initials = name
                      .trim()
                      .split(/\s+/)
                      .map((p) => p.charAt(0).toUpperCase())
                      .slice(0, 2)
                      .join('');
                    const palette = [
                      colors.primary,
                      colors.accent,
                      colors.gold,
                      colors.secondary,
                      colors.info,
                    ];
                    const bg = palette[idx % palette.length];
                    return (
                      <View key={`${name}-${idx}`} style={styles.teamCard}>
                        <View
                          style={[
                            styles.teamAvatar,
                            { backgroundColor: bg },
                          ]}
                        >
                          <Text style={styles.teamAvatarText}>{initials || '?'}</Text>
                        </View>
                        <Text style={styles.teamMemberName} numberOfLines={1}>
                          {name}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : (
              <View style={styles.teamEmpty}>
                <Ionicons name="person-add" size={48} color={colors.textSecondary} />
                <Text style={styles.teamEmptyTitle}>
                  Aucun prénom enregistré
                </Text>
                <Text style={styles.teamEmptyText}>
                  Rendez-vous dans <Text style={{ fontWeight: '700' }}>Profil</Text> pour ajouter les prénoms des membres de votre famille.
                </Text>
                <TouchableOpacity
                  style={styles.teamEmptyBtn}
                  onPress={() => {
                    setShowTeamModal(false);
                    router.push('/(tabs)/profile');
                  }}
                >
                  <Ionicons name="arrow-forward" size={18} color={colors.textWhite} />
                  <Text style={styles.teamEmptyBtnText}>Aller au profil</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundTertiary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
  },
  header: {
    padding: 16,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 0,
  },
  statsSection: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  statHint: {
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
    opacity: 0.8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  badgeItem: {
    width: '33.33%',
    padding: 4,
    alignItems: 'center',
  },
  badgeIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeName: {
    fontSize: 12,
    color: colors.text,
    textAlign: 'center',
  },
  emptySection: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  closingWordsContainer: {
    gap: 12,
  },
  closingWordCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
  },
  closingWordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  closingWordDate: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 8,
  },
  closingWordEpisode: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  closingWordContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  closingWordQuote: {
    fontSize: 32,
    color: colors.primary,
    fontWeight: 'bold',
    lineHeight: 32,
  },
  closingWordText: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    fontStyle: 'italic',
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  motivationCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  motivationText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginLeft: 12,
    fontStyle: 'italic',
  },
  teamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  teamBtnText: {
    color: colors.textWhite,
    fontWeight: '700',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  teamFamilyName: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '700',
    marginBottom: 4,
  },
  teamHint: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  teamGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginHorizontal: -6,
  },
  teamCard: {
    width: '33.33%',
    paddingHorizontal: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  teamAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  teamAvatarText: {
    color: colors.textWhite,
    fontSize: 26,
    fontWeight: 'bold',
  },
  teamMemberName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  teamEmpty: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  teamEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: 8,
  },
  teamEmptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  teamEmptyBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  teamEmptyBtnText: {
    color: colors.textWhite,
    fontWeight: '700',
    fontSize: 15,
  },
});