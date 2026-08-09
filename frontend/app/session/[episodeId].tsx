import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useAuth } from '@/src/contexts/AuthContext';
import { colors } from '@/src/theme/colors';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width } = Dimensions.get('window');

interface Card {
  type: string;
  content: string;
}

interface MiniGame {
  type?: string;  // letters, true_false, ranking, quiz, custom
  name: string;
  instructions: string;
  data?: any;
}

interface Episode {
  id: string;
  season_id: string;
  title: string;
  description: string;
  video_filename?: string;
  cards: Card[];
  mini_game?: MiniGame;
  mopado_reward: number;
}

type SessionStep = 'video' | 'cards' | 'game' | 'closing' | 'celebration';

export default function SessionScreen() {
  const { episodeId, seasonId } = useLocalSearchParams();
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<SessionStep>('video');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [closingWord, setClosingWord] = useState('');
  const [mopadoEarned, setMopadoEarned] = useState(0);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    loadEpisode();
  }, [episodeId]);

  const loadEpisode = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/episodes/${episodeId}`);
      if (response.ok) {
        const data = await response.json();
        setEpisode(data);
        await startSession(data.season_id);
      } else {
        Alert.alert('Erreur', 'Impossible de charger l\'épisode');
        router.back();
      }
    } catch (error) {
      console.error('Error loading episode:', error);
      Alert.alert('Erreur', 'Une erreur est survenue');
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const startSession = async (seasonIdValue: string) => {
    if (!user) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/sessions/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          family_id: user.id,
          episode_id: episodeId,
          season_id: seasonIdValue || seasonId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSessionId(data.session_id);
      }
    } catch (error) {
      console.error('Error starting session:', error);
    }
  };

  const handleNextStep = () => {
    if (currentStep === 'video') {
      if (episode?.cards && episode.cards.length > 0) {
        setCurrentStep('cards');
      } else if (episode?.mini_game) {
        setCurrentStep('game');
      } else {
        setCurrentStep('closing');
      }
    } else if (currentStep === 'cards') {
      if (currentCardIndex < (episode?.cards.length || 0) - 1) {
        setCurrentCardIndex(currentCardIndex + 1);
      } else if (episode?.mini_game) {
        setCurrentStep('game');
      } else {
        setCurrentStep('closing');
      }
    } else if (currentStep === 'game') {
      setCurrentStep('closing');
    }
  };

  const handleCompleteSession = async () => {
    if (!closingWord.trim()) {
      Alert.alert('Attention', 'Veuillez entrer un mot de fin');
      return;
    }

    if (!sessionId) {
      Alert.alert('Erreur', 'Session invalide');
      return;
    }

    setIsCompleting(true);
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/sessions/${sessionId}/complete`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ closing_word: closingWord }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setMopadoEarned(data.mopado_earned);
        setAlreadyCompleted(data.already_completed || false);
        await refreshUser();
        setCurrentStep('celebration');
      } else {
        Alert.alert('Erreur', 'Impossible de terminer la session');
      }
    } catch (error) {
      console.error('Error completing session:', error);
      Alert.alert('Erreur', 'Une erreur est survenue');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleExit = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!episode) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleExit} style={styles.closeButton}>
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{episode.title}</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Video Step */}
      {currentStep === 'video' && (
        <VideoStepContent
          videoFilename={episode.video_filename}
          onNext={handleNextStep}
        />
      )}

      {/* Cards Step */}
      {currentStep === 'cards' && episode.cards && (
        <CardsStepContent
          card={episode.cards[currentCardIndex]}
          currentIndex={currentCardIndex}
          totalCards={episode.cards.length}
          onNext={handleNextStep}
        />
      )}

      {/* Game Step */}
      {currentStep === 'game' && episode.mini_game && (
        <GameStepContent game={episode.mini_game} onNext={handleNextStep} />
      )}

      {/* Closing Step */}
      {currentStep === 'closing' && (
        <ClosingStepContent
          closingWord={closingWord}
          setClosingWord={setClosingWord}
          onComplete={handleCompleteSession}
          isCompleting={isCompleting}
        />
      )}

      {/* Celebration Step */}
      {currentStep === 'celebration' && (
        <CelebrationStepContent
          mopadoEarned={mopadoEarned}
          alreadyCompleted={alreadyCompleted}
          onFinish={handleExit}
        />
      )}
    </SafeAreaView>
  );
}

// Video Step Component
function VideoStepContent({
  videoFilename,
  onNext,
}: {
  videoFilename?: string;
  onNext: () => void;
}) {
  const videoUrl = videoFilename
    ? `${BACKEND_URL}/api/videos/${videoFilename}`
    : null;

  const player = useVideoPlayer(videoUrl, (player) => {
    player.loop = false;
    player.muted = false;
  });

  return (
    <View style={styles.stepContainer}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.videoContainer}>
          {videoUrl ? (
            <VideoView
              style={styles.video}
              player={player}
              allowsFullscreen
              allowsPictureInPicture
              contentFit="contain"
              nativeControls
            />
          ) : (
            <View style={styles.videoPlaceholder}>
              <Ionicons name="film-outline" size={64} color={colors.textSecondary} />
              <Text style={styles.placeholderText}>
                Aucune vidéo disponible
              </Text>
              <Text style={styles.placeholderSubtext}>
                La vidéo sera ajoutée prochainement
              </Text>
            </View>
          )}
        </View>

        <View style={styles.instructionCard}>
          <Ionicons name="information-circle" size={24} color={colors.primary} />
          <Text style={styles.instructionText}>
            Regardez cette courte vidéo ensemble en famille (maximum 2 minutes)
          </Text>
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.continueButton} onPress={onNext}>
        <Text style={styles.continueButtonText}>Continuer</Text>
        <Ionicons name="arrow-forward" size={20} color={colors.textWhite} />
      </TouchableOpacity>
    </View>
  );
}

// Cards Step Component
function CardsStepContent({
  card,
  currentIndex,
  totalCards,
  onNext,
}: {
  card: Card;
  currentIndex: number;
  totalCards: number;
  onNext: () => void;
}) {
  return (
    <View style={styles.stepContainer}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.progressIndicator}>
          <Text style={styles.progressText}>
            Carte {currentIndex + 1} sur {totalCards}
          </Text>
        </View>

        <View style={styles.cardContainer}>
          <View style={styles.cardIcon}>
            <Ionicons name="chatbox-ellipses" size={48} color={colors.primary} />
          </View>
          <Text style={styles.cardContent}>{card.content}</Text>
        </View>

        <View style={styles.instructionCard}>
          <Ionicons name="people" size={24} color={colors.accent} />
          <Text style={styles.instructionText}>
            Prenez le temps d'écouter chaque membre de la famille
          </Text>
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.continueButton} onPress={onNext}>
        <Text style={styles.continueButtonText}>Suivant</Text>
        <Ionicons name="arrow-forward" size={20} color={colors.textWhite} />
      </TouchableOpacity>
    </View>
  );
}

// Game Step Component - dispatches to specific game type
function GameStepContent({
  game,
  onNext,
}: {
  game: MiniGame;
  onNext: () => void;
}) {
  const gameType = game.type || 'letters';

  return (
    <View style={styles.stepContainer}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.gameHeader}>
          <Ionicons name="game-controller" size={48} color={colors.primary} />
          <Text style={styles.gameTitle}>{game.name}</Text>
        </View>

        <View style={styles.gameInstructions}>
          <Text style={styles.gameInstructionsText}>{game.instructions}</Text>
        </View>

        {/* Render game type-specific content */}
        {gameType === 'letters' && <LettersGame />}
        {gameType === 'true_false' && <TrueFalseGame data={game.data} />}
        {gameType === 'ranking' && <RankingGame data={game.data} />}
        {gameType === 'quiz' && <QuizGame data={game.data} />}
        {gameType === 'custom' && <CustomGame />}
      </ScrollView>

      <TouchableOpacity style={styles.continueButton} onPress={onNext}>
        <Text style={styles.continueButtonText}>Nous avons terminé</Text>
        <Ionicons name="checkmark" size={20} color={colors.textWhite} />
      </TouchableOpacity>
    </View>
  );
}

// Letters Game (C'est quali)
function LettersGame() {
  const [letters] = useState(() => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randomLetters = [];
    for (let i = 0; i < 4; i++) {
      randomLetters.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
    }
    return randomLetters;
  });

  return (
    <>
      <View style={styles.lettersContainer}>
        {letters.map((letter, index) => (
          <View key={index} style={styles.letterCard}>
            <Text style={styles.letterText}>{letter}</Text>
          </View>
        ))}
      </View>
      <View style={styles.instructionCard}>
        <Ionicons name="happy" size={24} color={colors.accent} />
        <Text style={styles.instructionText}>
          Chacun trouve une qualité pour un autre membre de la famille commençant par l'une des lettres
        </Text>
      </View>
    </>
  );
}

// True/False Game
function TrueFalseGame({ data }: { data?: any }) {
  const [answers, setAnswers] = useState<{ [key: number]: boolean | null }>({});
  const statements = data?.statements || [];

  const handleAnswer = (index: number, answer: boolean) => {
    setAnswers({ ...answers, [index]: answer });
  };

  return (
    <View style={styles.gameContent}>
      {statements.map((statement: any, index: number) => {
        const userAnswer = answers[index];
        const isRevealed = userAnswer !== undefined && userAnswer !== null;
        const isCorrect = userAnswer === statement.answer;
        
        return (
          <View key={index} style={styles.tfCard}>
            <Text style={styles.tfText}>{statement.text}</Text>
            <View style={styles.tfButtonsContainer}>
              <TouchableOpacity
                style={[
                  styles.tfButton,
                  userAnswer === true && (isCorrect ? styles.tfButtonCorrect : styles.tfButtonWrong),
                ]}
                onPress={() => handleAnswer(index, true)}
              >
                <Ionicons name="checkmark" size={20} color={colors.textWhite} />
                <Text style={styles.tfButtonText}>Vrai</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tfButton,
                  styles.tfButtonFalse,
                  userAnswer === false && (isCorrect ? styles.tfButtonCorrect : styles.tfButtonWrong),
                ]}
                onPress={() => handleAnswer(index, false)}
              >
                <Ionicons name="close" size={20} color={colors.textWhite} />
                <Text style={styles.tfButtonText}>Faux</Text>
              </TouchableOpacity>
            </View>
            {isRevealed && (
              <View style={styles.tfResult}>
                <Ionicons
                  name={isCorrect ? 'checkmark-circle' : 'information-circle'}
                  size={20}
                  color={isCorrect ? colors.success : colors.info}
                />
                <Text style={styles.tfResultText}>
                  {isCorrect ? 'Bonne réponse !' : `La réponse était : ${statement.answer ? 'Vrai' : 'Faux'}`}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// Ranking Game
function RankingGame({ data }: { data?: any }) {
  const initialItems = data?.items || [];
  const [items, setItems] = useState<string[]>(initialItems);
  const question = data?.question || 'Classe ces éléments';

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newItems = [...items];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
    setItems(newItems);
  };

  const moveDown = (index: number) => {
    if (index === items.length - 1) return;
    const newItems = [...items];
    [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    setItems(newItems);
  };

  return (
    <View style={styles.gameContent}>
      <View style={styles.rankingQuestion}>
        <Text style={styles.rankingQuestionText}>{question}</Text>
      </View>
      {items.map((item, index) => (
        <View key={`${item}-${index}`} style={styles.rankingItem}>
          <View style={styles.rankingBadge}>
            <Text style={styles.rankingBadgeText}>{index + 1}</Text>
          </View>
          <Text style={styles.rankingText}>{item}</Text>
          <View style={styles.rankingArrows}>
            <TouchableOpacity
              onPress={() => moveUp(index)}
              disabled={index === 0}
              style={[styles.rankingArrow, index === 0 && styles.rankingArrowDisabled]}
            >
              <Ionicons name="chevron-up" size={20} color={index === 0 ? colors.textLight : colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => moveDown(index)}
              disabled={index === items.length - 1}
              style={[styles.rankingArrow, index === items.length - 1 && styles.rankingArrowDisabled]}
            >
              <Ionicons name="chevron-down" size={20} color={index === items.length - 1 ? colors.textLight : colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

// Quiz Game
function QuizGame({ data }: { data?: any }) {
  const questions = data?.questions || [];
  const [answers, setAnswers] = useState<{ [key: number]: number | null }>({});

  const handleAnswer = (questionIndex: number, answerIndex: number) => {
    setAnswers({ ...answers, [questionIndex]: answerIndex });
  };

  return (
    <View style={styles.gameContent}>
      {questions.map((q: any, qIndex: number) => {
        const userAnswer = answers[qIndex];
        const isAnswered = userAnswer !== undefined && userAnswer !== null;
        
        return (
          <View key={qIndex} style={styles.quizCard}>
            <Text style={styles.quizQuestion}>{q.question}</Text>
            {q.answers?.map((answer: string, aIndex: number) => {
              if (!answer) return null;
              const isSelected = userAnswer === aIndex;
              const isCorrect = aIndex === q.correct;
              
              return (
                <TouchableOpacity
                  key={aIndex}
                  style={[
                    styles.quizAnswer,
                    isSelected && (isCorrect ? styles.quizAnswerCorrect : styles.quizAnswerWrong),
                    isAnswered && !isSelected && isCorrect && styles.quizAnswerCorrectHint,
                  ]}
                  onPress={() => handleAnswer(qIndex, aIndex)}
                  disabled={isAnswered}
                >
                  <Text style={[
                    styles.quizAnswerText,
                    isSelected && styles.quizAnswerTextSelected,
                  ]}>
                    {answer}
                  </Text>
                  {isAnswered && isSelected && (
                    <Ionicons
                      name={isCorrect ? 'checkmark-circle' : 'close-circle'}
                      size={20}
                      color={colors.textWhite}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

// Custom Game
function CustomGame() {
  return (
    <View style={styles.instructionCard}>
      <Ionicons name="game-controller" size={24} color={colors.accent} />
      <Text style={styles.instructionText}>
        Suivez les instructions du jeu ci-dessus et amusez-vous en famille !
      </Text>
    </View>
  );
}

// Closing Step Component
function ClosingStepContent({
  closingWord,
  setClosingWord,
  onComplete,
  isCompleting,
}: {
  closingWord: string;
  setClosingWord: (text: string) => void;
  onComplete: () => void;
  isCompleting: boolean;
}) {
  return (
    <KeyboardAvoidingView
      style={styles.stepContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.closingHeader}>
          <Ionicons name="create" size={48} color={colors.primary} />
          <Text style={styles.closingTitle}>Quel mot résume le mieux ce moment ?</Text>
        </View>

        <TextInput
          style={styles.closingInput}
          placeholder="Écrivez votre mot ici..."
          placeholderTextColor={colors.textSecondary}
          value={closingWord}
          onChangeText={setClosingWord}
          multiline
          maxLength={200}
          autoFocus
        />

        <View style={styles.instructionCard}>
          <Ionicons name="heart" size={24} color={colors.accent} />
          <Text style={styles.instructionText}>
            Ce mot restera dans votre mémoire familiale
          </Text>
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[styles.continueButton, isCompleting && styles.buttonDisabled]}
        onPress={onComplete}
        disabled={isCompleting}
      >
        {isCompleting ? (
          <ActivityIndicator color={colors.textWhite} />
        ) : (
          <>
            <Text style={styles.continueButtonText}>Terminer</Text>
            <Ionicons name="checkmark-circle" size={20} color={colors.textWhite} />
          </>
        )}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

// Celebration Step Component
function CelebrationStepContent({
  mopadoEarned,
  alreadyCompleted,
  onFinish,
}: {
  mopadoEarned: number;
  alreadyCompleted: boolean;
  onFinish: () => void;
}) {
  return (
    <View style={styles.stepContainer}>
      <ScrollView contentContainerStyle={[styles.scrollContent, styles.celebrationContent]}>
        <Ionicons name="trophy" size={100} color={colors.gold} />
        
        <Text style={styles.celebrationTitle}>Bravo !</Text>
        <Text style={styles.celebrationSubtitle}>
          Vous avez terminé votre moment Mopado
        </Text>

        {alreadyCompleted ? (
          <View style={styles.rewardCard}>
            <Ionicons name="information-circle" size={48} color={colors.info} />
            <Text style={styles.alreadyCompletedText}>
              Épisode déjà complété
            </Text>
            <Text style={styles.alreadyCompletedSubtext}>
              Vous avez déjà gagné les Mopado$ pour cet épisode
            </Text>
          </View>
        ) : (
          <View style={styles.rewardCard}>
            <Ionicons name="cash" size={48} color={colors.primary} />
            <Text style={styles.rewardAmount}>+{mopadoEarned} Mopado$</Text>
          </View>
        )}

        <View style={styles.celebrationMessage}>
          <Ionicons name="heart" size={32} color={colors.accent} />
          <Text style={styles.celebrationText}>
            Un moment précieux passé ensemble. Rendez-vous la semaine prochaine !
          </Text>
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.continueButton} onPress={onFinish}>
        <Text style={styles.continueButtonText}>Retour à l'accueil</Text>
        <Ionicons name="home" size={20} color={colors.textWhite} />
      </TouchableOpacity>
    </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  stepContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
    backgroundColor: colors.background,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.text,
  },
  videoPlaceholderText: {
    color: colors.textWhite,
    fontSize: 14,
    marginTop: 12,
  },
  placeholderText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  placeholderSubtext: {
    color: colors.textLight,
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  instructionCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 12,
    lineHeight: 20,
  },
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    color: colors.textWhite,
    fontSize: 18,
    fontWeight: '600',
    marginRight: 8,
  },
  progressIndicator: {
    alignItems: 'center',
    marginBottom: 24,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  cardContainer: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    minHeight: 300,
    justifyContent: 'center',
  },
  cardIcon: {
    marginBottom: 24,
  },
  cardContent: {
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 32,
    fontWeight: '500',
  },
  gameHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  gameTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.primary,
    marginTop: 16,
  },
  gameInstructions: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  gameInstructionsText: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
    textAlign: 'center',
  },
  lettersContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  letterCard: {
    width: 70,
    height: 70,
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  letterText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.textWhite,
  },
  gameContent: {
    gap: 12,
    marginBottom: 24,
  },
  // True/False Game styles
  tfCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  tfText: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 12,
    lineHeight: 22,
  },
  tfButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  tfButton: {
    flex: 1,
    backgroundColor: colors.success,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  tfButtonFalse: {
    backgroundColor: colors.error,
  },
  tfButtonCorrect: {
    backgroundColor: colors.success,
  },
  tfButtonWrong: {
    backgroundColor: colors.error,
    opacity: 0.6,
  },
  tfButtonText: {
    color: colors.textWhite,
    fontSize: 14,
    fontWeight: '600',
  },
  tfResult: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 8,
    gap: 6,
  },
  tfResultText: {
    fontSize: 13,
    color: colors.text,
    flex: 1,
  },
  // Ranking Game styles
  rankingQuestion: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  rankingQuestionText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  rankingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  rankingBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankingBadgeText: {
    color: colors.textWhite,
    fontSize: 14,
    fontWeight: 'bold',
  },
  rankingText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  rankingArrows: {
    gap: 4,
  },
  rankingArrow: {
    padding: 4,
  },
  rankingArrowDisabled: {
    opacity: 0.3,
  },
  // Quiz Game styles
  quizCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  quizQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    lineHeight: 22,
  },
  quizAnswer: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quizAnswerCorrect: {
    backgroundColor: colors.success,
  },
  quizAnswerWrong: {
    backgroundColor: colors.error,
  },
  quizAnswerCorrectHint: {
    backgroundColor: colors.accentLight,
  },
  quizAnswerText: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  quizAnswerTextSelected: {
    color: colors.textWhite,
    fontWeight: '600',
  },
  closingHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  closingTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    textAlign: 'center',
  },
  closingInput: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 20,
    fontSize: 18,
    color: colors.text,
    minHeight: 150,
    textAlignVertical: 'top',
    marginBottom: 24,
  },
  celebrationContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  celebrationTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.primary,
    marginTop: 24,
  },
  celebrationSubtitle: {
    fontSize: 18,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  rewardCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginTop: 32,
    width: '100%',
  },
  rewardAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.primary,
    marginTop: 12,
  },
  alreadyCompletedText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.info,
    marginTop: 12,
    textAlign: 'center',
  },
  alreadyCompletedSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  celebrationMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 20,
    marginTop: 24,
  },
  celebrationText: {
    flex: 1,
    fontSize: 16,
    color: colors.textSecondary,
    marginLeft: 12,
    lineHeight: 24,
    fontStyle: 'italic',
  },
});
