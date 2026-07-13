import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/contexts/AuthContext';
import { colors } from '@/src/theme/colors';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Season {
  id: string;
  name: string;
  description: string;
  order: number;
  image_base64?: string;
}

interface Episode {
  id: string;
  season_id: string;
  title: string;
  description: string;
  order: number;
}

export default function LibraryScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [episodes, setEpisodes] = useState<{ [key: string]: Episode[] }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const seasonsResponse = await fetch(`${BACKEND_URL}/api/seasons`);
      if (seasonsResponse.ok) {
        const seasonsData = await seasonsResponse.json();
        setSeasons(seasonsData);

        // Load episodes for each season
        const episodesMap: { [key: string]: Episode[] } = {};
        for (const season of seasonsData) {
          const episodesResponse = await fetch(
            `${BACKEND_URL}/api/episodes/season/${season.id}`
          );
          if (episodesResponse.ok) {
            const episodesData = await episodesResponse.json();
            episodesMap[season.id] = episodesData;
          }
        }
        setEpisodes(episodesMap);
      }
    } catch (error) {
      console.error('Error loading library:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const toggleSeason = (seasonId: string) => {
    setExpandedSeasons((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(seasonId)) {
        newSet.delete(seasonId);
      } else {
        newSet.add(seasonId);
      }
      return newSet;
    });
  };

  const isEpisodeCompleted = (episodeId: string) => {
    return user?.completed_episodes?.includes(episodeId) || false;
  };

  const getSeasonProgress = (seasonId: string) => {
    const seasonEpisodes = episodes[seasonId] || [];
    if (seasonEpisodes.length === 0) return 0;
    const completed = seasonEpisodes.filter((ep) => isEpisodeCompleted(ep.id)).length;
    return Math.round((completed / seasonEpisodes.length) * 100);
  };

  const handleEpisodePress = (episode: Episode, seasonId: string) => {
    router.push(`/session/${episode.id}?seasonId=${seasonId}`);
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
        <Text style={styles.headerTitle}>Bibliothèque</Text>
        <Text style={styles.headerSubtitle}>Explorez toutes les saisons Mopado</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {seasons.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="library-outline" size={64} color={colors.textSecondary} />
            <Text style={styles.emptyText}>Aucune saison disponible</Text>
            <Text style={styles.emptySubtext}>
              Les saisons Mopado seront bientôt disponibles !
            </Text>
          </View>
        ) : (
          seasons.map((season) => {
            const isExpanded = expandedSeasons.has(season.id);
            const progress = getSeasonProgress(season.id);
            const seasonEpisodes = episodes[season.id] || [];

            return (
              <View key={season.id} style={styles.seasonContainer}>
                <TouchableOpacity
                  style={styles.seasonHeader}
                  onPress={() => toggleSeason(season.id)}
                >
                  <View style={styles.seasonIconContainer}>
                    <Ionicons name="book" size={24} color={colors.primary} />
                  </View>
                  <View style={styles.seasonInfo}>
                    <Text style={styles.seasonName}>{season.name}</Text>
                    <Text style={styles.seasonDescription} numberOfLines={2}>
                      {season.description}
                    </Text>
                    <View style={styles.progressContainer}>
                      <View style={styles.progressBar}>
                        <View
                          style={[styles.progressFill, { width: `${progress}%` }]}
                        />
                      </View>
                      <Text style={styles.progressText}>{progress}%</Text>
                    </View>
                  </View>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={24}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.episodesContainer}>
                    {seasonEpisodes.length === 0 ? (
                      <Text style={styles.noEpisodesText}>
                        Aucun épisode disponible dans cette saison
                      </Text>
                    ) : (
                      seasonEpisodes.map((episode) => {
                        const completed = isEpisodeCompleted(episode.id);
                        return (
                          <TouchableOpacity
                            key={episode.id}
                            style={styles.episodeItem}
                            onPress={() => handleEpisodePress(episode, season.id)}
                          >
                            <View
                              style={[
                                styles.episodeStatusIcon,
                                completed && styles.episodeStatusIconCompleted,
                              ]}
                            >
                              <Ionicons
                                name={completed ? 'checkmark' : 'play'}
                                size={16}
                                color={completed ? colors.success : colors.primary}
                              />
                            </View>
                            <View style={styles.episodeItemInfo}>
                              <Text style={styles.episodeTitle}>
                                {episode.title}
                              </Text>
                              <Text
                                style={styles.episodeDescription}
                                numberOfLines={1}
                              >
                                {episode.description}
                              </Text>
                            </View>
                            <Ionicons
                              name="chevron-forward"
                              size={20}
                              color={colors.textSecondary}
                            />
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
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
  seasonContainer: {
    backgroundColor: colors.background,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  seasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  seasonIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  seasonInfo: {
    flex: 1,
    marginRight: 12,
  },
  seasonName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  seasonDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.divider,
    borderRadius: 3,
    overflow: 'hidden',
    marginRight: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    width: 35,
  },
  episodesContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 8,
  },
  noEpisodesText: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 14,
    paddingVertical: 16,
  },
  episodeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
  },
  episodeStatusIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  episodeStatusIconCompleted: {
    backgroundColor: colors.accentLight,
  },
  episodeItemInfo: {
    flex: 1,
    marginRight: 8,
  },
  episodeTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
  },
  episodeDescription: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});