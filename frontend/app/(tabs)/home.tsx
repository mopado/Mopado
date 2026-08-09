import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/contexts/AuthContext';
import { colors } from '@/src/theme/colors';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Season {
  id: string;
  name: string;
  description: string;
  order: number;
}

interface Episode {
  id: string;
  title: string;
  description: string;
  order: number;
}

export default function HomeScreen() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [currentSeasonId, setCurrentSeasonId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  // Reload data when screen is focused (e.g., returning from session)
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      // Refresh user first and get the latest data
      await refreshUser();
      
      // Get the fresh user data from storage (since state update is async)
      const freshUserData = await fetch(`${BACKEND_URL}/api/family/${user?.id}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null);
      
      const completedEpisodes = freshUserData?.completed_episodes || user?.completed_episodes || [];
      
      // Load seasons
      const seasonsResponse = await fetch(`${BACKEND_URL}/api/seasons`);
      if (seasonsResponse.ok) {
        const seasonsData = await seasonsResponse.json();
        setSeasons(seasonsData);

        // Find first uncompleted episode across all seasons
        let foundEpisode: Episode | null = null;
        let foundSeasonId: string | null = null;
        
        for (const season of seasonsData) {
          const episodesResponse = await fetch(
            `${BACKEND_URL}/api/episodes/season/${season.id}`
          );
          if (episodesResponse.ok) {
            const episodesData = await episodesResponse.json();
            // Find first episode not yet completed (use fresh data)
            const uncompletedEpisode = episodesData.find(
              (ep: Episode) => !completedEpisodes.includes(ep.id)
            );
            
            if (uncompletedEpisode) {
              foundEpisode = uncompletedEpisode;
              foundSeasonId = season.id;
              break;
            }
          }
        }
        
        // If all episodes are completed, foundEpisode stays null (no episode shown)
        setCurrentEpisode(foundEpisode);
        setCurrentSeasonId(foundSeasonId);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleStartSession = () => {
    if (currentEpisode && currentSeasonId) {
      router.push(`/session/${currentEpisode.id}?seasonId=${currentSeasonId}`);
    }
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Bonjour,</Text>
            <Text style={styles.familyName}>Famille {user?.family_name} !</Text>
          </View>
          <Ionicons name="heart-circle" size={48} color={colors.primary} />
        </View>

        {/* Current Season Card */}
        {seasons.length > 0 ? (
          <View style={styles.seasonCard}>
            <View style={styles.seasonBadge}>
              <Ionicons name="star" size={16} color={colors.gold} />
              <Text style={styles.seasonBadgeText}>Saison en cours</Text>
            </View>
            <Text style={styles.seasonTitle}>
              {seasons.find(s => s.id === currentSeasonId)?.name || seasons[0].name}
            </Text>
            <Text style={styles.seasonDescription}>
              {seasons.find(s => s.id === currentSeasonId)?.description || seasons[0].description}
            </Text>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="book-outline" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyText}>Aucune saison disponible</Text>
            <Text style={styles.emptySubtext}>
              Les saisons Mopado seront bientôt ajoutées !
            </Text>
          </View>
        )}

        {/* Episode of the week */}
        {currentEpisode ? (
          <View style={styles.episodeSection}>
            <Text style={styles.sectionTitle}>Épisode de la semaine</Text>
            <View style={styles.episodeCard}>
              <View style={styles.episodeHeader}>
                <View style={styles.episodeIcon}>
                  <Ionicons name="play-circle" size={32} color={colors.primary} />
                </View>
                <View style={styles.episodeInfo}>
                  <Text style={styles.episodeTitle}>{currentEpisode.title}</Text>
                  <Text style={styles.episodeDescription} numberOfLines={2}>
                    {currentEpisode.description}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.startButton}
                onPress={handleStartSession}
                testID="start-episode-button"
              >
                <Text style={styles.startButtonText}>Commencer</Text>
                <Ionicons name="arrow-forward" size={20} color={colors.textWhite} />
              </TouchableOpacity>
            </View>
          </View>
        ) : seasons.length > 0 ? (
          <View style={styles.episodeSection}>
            <View style={styles.allCompletedCard}>
              <Ionicons name="checkmark-circle" size={64} color={colors.success} />
              <Text style={styles.allCompletedTitle}>Tous les épisodes sont terminés !</Text>
              <Text style={styles.allCompletedText}>
                Bravo à toute la famille ! Consultez la bibliothèque pour revoir vos épisodes ou attendez le prochain !
              </Text>
            </View>
          </View>
        ) : null}

        {/* Progress Summary */}
        <View style={styles.progressSection}>
          <Text style={styles.sectionTitle}>Votre progression</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons name="cash" size={32} color={colors.primary} />
              <Text style={styles.statValue}>{user?.mopado_dollars || 0}</Text>
              <Text style={styles.statLabel}>Mopado$</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="medal" size={32} color={colors.gold} />
              <Text style={styles.statValue}>{user?.badges?.length || 0}</Text>
              <Text style={styles.statLabel}>Badges</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="checkmark-circle" size={32} color={colors.success} />
              <Text style={styles.statValue}>
                {user?.completed_episodes?.length || 0}
              </Text>
              <Text style={styles.statLabel}>Épisodes</Text>
            </View>
          </View>
        </View>

        {/* Motivational Message */}
        <View style={styles.motivationCard}>
          <Ionicons name="heart" size={24} color={colors.accent} style={styles.motivationIcon} />
          <Text style={styles.motivationText}>
            15 minutes par semaine pour se retrouver et échanger en famille, simplement.
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
  scrollContent: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  familyName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 4,
  },
  seasonCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: colors.primaryLight,
  },
  seasonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 12,
  },
  seasonBadgeText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  seasonTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 8,
  },
  seasonDescription: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  emptyCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  episodeSection: {
    marginBottom: 24,
  },
  allCompletedCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.success,
  },
  allCompletedTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 16,
    textAlign: 'center',
  },
  allCompletedText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  episodeCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 16,
  },
  episodeHeader: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  episodeIcon: {
    marginRight: 12,
  },
  episodeInfo: {
    flex: 1,
  },
  episodeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  episodeDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  startButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  startButtonText: {
    color: colors.textWhite,
    fontSize: 18,
    fontWeight: '600',
    marginRight: 8,
  },
  progressSection: {
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  motivationCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  motivationIcon: {
    marginRight: 12,
  },
  motivationText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    fontStyle: 'italic',
  },
});