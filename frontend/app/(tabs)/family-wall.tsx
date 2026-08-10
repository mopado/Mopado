import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
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
}

export default function FamilyWallScreen() {
  const { user, refreshUser } = useAuth();
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
        <Text style={styles.headerTitle}>Mur Familial</Text>
        <Text style={styles.headerSubtitle}>Vos souvenirs et récompenses</Text>
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
              <Ionicons name="calendar" size={32} color={colors.secondary} />
            </View>
            <Text style={styles.statValue}>
              {progressData?.total_sessions || 0}
            </Text>
            <Text style={styles.statLabel}>Sessions totales</Text>
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
});