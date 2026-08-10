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
  title?: string;
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
  cards_message?: string;
  cards_after_game?: Card[];
  mini_game?: MiniGame;
  mopado_reward: number;
  reward_message?: string;
  bonus_mission?: string;
  closing_message?: string;
  badge_name?: string;
  badge_description?: string;
}

type SessionStep = 'video' | 'cards' | 'game' | 'cards_after' | 'closing' | 'celebration' | 'bonus_mission';

export default function SessionScreen() {
  const { episodeId, seasonId } = useLocalSearchParams();
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<SessionStep>('video');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [currentCardAfterIndex, setCurrentCardAfterIndex] = useState(0);
  const [closingWord, setClosingWord] = useState('');
  const [closingError, setClosingError] = useState('');
  const [mopadoEarned, setMopadoEarned] = useState(0);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [rewardMessage, setRewardMessage] = useState('');
  const [bonusMission, setBonusMission] = useState<string | null>(null);
  const [closingMessage, setClosingMessage] = useState('Rendez-vous la semaine prochaine pour un nouveau moment qui compte, ensemble !');
  const [badgesEarned, setBadgesEarned] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);
  
  // Detect if episode is already completed BEFORE starting the session
  const isAlreadyCompleted = user?.completed_episodes?.includes(episodeId as string) || false;

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
      } else if (episode?.cards_after_game && episode.cards_after_game.length > 0) {
        setCurrentStep('cards_after');
      } else {
        setCurrentStep('closing');
      }
    } else if (currentStep === 'cards') {
      if (currentCardIndex < (episode?.cards.length || 0) - 1) {
        setCurrentCardIndex(currentCardIndex + 1);
      } else if (episode?.mini_game) {
        setCurrentStep('game');
      } else if (episode?.cards_after_game && episode.cards_after_game.length > 0) {
        setCurrentStep('cards_after');
      } else {
        setCurrentStep('closing');
      }
    } else if (currentStep === 'game') {
      if (episode?.cards_after_game && episode.cards_after_game.length > 0) {
        setCurrentStep('cards_after');
      } else {
        setCurrentStep('closing');
      }
    } else if (currentStep === 'cards_after') {
      if (currentCardAfterIndex < (episode?.cards_after_game?.length || 0) - 1) {
        setCurrentCardAfterIndex(currentCardAfterIndex + 1);
      } else {
        setCurrentStep('closing');
      }
    }
  };

  const handleCompleteSession = async () => {
    if (!closingWord.trim()) {
      setClosingError("Choisissez d'abord un mot");
      return;
    }
    setClosingError('');

    if (!sessionId) {
      setClosingError('Session invalide');
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
        setRewardMessage(data.reward_message || 'Merci pour ce beau moment ensemble !');
        setBonusMission(data.bonus_mission || null);
        setClosingMessage(data.closing_message || 'Rendez-vous la semaine prochaine pour un nouveau moment qui compte, ensemble !');
        setBadgesEarned(data.badges_earned || []);
        await refreshUser();
        setCurrentStep('celebration');
      } else {
        setClosingError('Impossible de terminer la session');
      }
    } catch (error) {
      console.error('Error completing session:', error);
      setClosingError('Une erreur est survenue');
    } finally {
      setIsCompleting(false);
    }
  };
  
  const handleNextAfterCelebration = () => {
    if (bonusMission) {
      setCurrentStep('bonus_mission');
    } else {
      handleExit();
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
          <Ionicons name="close" size={24} color={colors.textWhite} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Ionicons name="heart-circle" size={20} color={colors.textWhite} style={{ marginRight: 8 }} />
          <Text style={styles.headerTitle} numberOfLines={1}>{episode.title}</Text>
        </View>
        <View style={styles.placeholder} />
      </View>
      
      {/* Already completed banner */}
      {isAlreadyCompleted && (
        <View style={styles.alreadyCompletedBanner}>
          <Ionicons name="checkmark-circle" size={18} color={colors.textWhite} />
          <Text style={styles.alreadyCompletedBannerText}>
            Épisode déjà effectué • Aucun Mopado$ à gagner
          </Text>
        </View>
      )}

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
          message={episode.cards_message || 'On répond chacun son tour.'}
          onNext={handleNextStep}
        />
      )}

      {/* Game Step */}
      {currentStep === 'game' && episode.mini_game && (
        <GameStepContent game={episode.mini_game} onNext={handleNextStep} />
      )}

      {/* Cards After Game Step */}
      {currentStep === 'cards_after' && episode.cards_after_game && episode.cards_after_game.length > 0 && (
        <CardsStepContent
          card={episode.cards_after_game[currentCardAfterIndex]}
          currentIndex={currentCardAfterIndex}
          totalCards={episode.cards_after_game.length}
          message={episode.cards_message || 'On répond chacun son tour.'}
          onNext={handleNextStep}
          isAfterGame={true}
        />
      )}

      {/* Closing Step */}
      {currentStep === 'closing' && (
        <ClosingStepContent
          closingWord={closingWord}
          setClosingWord={setClosingWord}
          error={closingError}
          onComplete={handleCompleteSession}
          isCompleting={isCompleting}
        />
      )}

      {/* Celebration Step */}
      {currentStep === 'celebration' && (
        <CelebrationStepContent
          mopadoEarned={mopadoEarned}
          alreadyCompleted={alreadyCompleted}
          rewardMessage={rewardMessage}
          closingMessage={closingMessage}
          badgesEarned={badgesEarned}
          hasBonusMission={!!bonusMission}
          onFinish={handleNextAfterCelebration}
        />
      )}
      
      {/* Bonus Mission Step */}
      {currentStep === 'bonus_mission' && bonusMission && (
        <BonusMissionStepContent
          mission={bonusMission}
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
    if (videoUrl) {
      player.play();
    }
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
  message,
  onNext,
  isAfterGame = false,
}: {
  card: Card;
  currentIndex: number;
  totalCards: number;
  message: string;
  onNext: () => void;
  isAfterGame?: boolean;
}) {
  return (
    <View style={styles.stepContainer}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.progressIndicator}>
          <Text style={styles.progressText}>
            {isAfterGame ? 'Bonus • ' : ''}Carte {currentIndex + 1} sur {totalCards}
          </Text>
        </View>

        <View style={styles.cardContainer}>
          {card.title ? (
            <View style={styles.cardTitleContainer}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <View style={styles.cardTitleUnderline} />
            </View>
          ) : null}
          <Text style={styles.cardContent}>{card.content}</Text>
        </View>

        <View style={styles.cardMessageContainer}>
          <Ionicons name="people" size={20} color={colors.accent} />
          <Text style={styles.cardMessageText}>{message}</Text>
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
  // For letters and ranking, hide the button until reveal
  const [showTerminateButton, setShowTerminateButton] = useState(
    gameType !== 'letters' && gameType !== 'ranking'
  );

  return (
    <View style={styles.stepContainer}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.gameHeader}>
          <Ionicons name="game-controller" size={48} color={colors.primary} />
          <Text style={styles.gameTitle}>{game.name}</Text>
        </View>

        {/* Show instructions only if NOT letters/ranking game (they show their own) */}
        {gameType !== 'letters' && gameType !== 'ranking' && (
          <View style={styles.gameInstructions}>
            <Text style={styles.gameInstructionsText}>{game.instructions}</Text>
          </View>
        )}

        {/* Render game type-specific content */}
        {gameType === 'letters' && (
          <LettersGame
            instructions={game.instructions}
            onReveal={() => setShowTerminateButton(true)}
          />
        )}
        {gameType === 'true_false' && <TrueFalseGame data={game.data} />}
        {gameType === 'ranking' && (
          <RankingGame
            instructions={game.instructions}
            data={game.data}
            onReveal={() => setShowTerminateButton(true)}
          />
        )}
        {gameType === 'quiz' && <QuizGame data={game.data} />}
        {gameType === 'custom' && <CustomGame />}
      </ScrollView>

      {showTerminateButton && (
        <TouchableOpacity style={styles.continueButton} onPress={onNext}>
          <Text style={styles.continueButtonText}>Nous avons terminé</Text>
          <Ionicons name="checkmark" size={20} color={colors.textWhite} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// Letters Game (C'est quali)
function LettersGame({
  instructions,
  onReveal,
}: {
  instructions: string;
  onReveal: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [letters] = useState(() => {
    // Restricted alphabet as requested
    const alphabet = ['B', 'T', 'R', 'E', 'A', 'M', 'J', 'O', 'C', 'N'];
    const availableLetters = [...alphabet];
    const randomLetters: string[] = [];
    // Ensure unique letters
    for (let i = 0; i < 4; i++) {
      const randomIndex = Math.floor(Math.random() * availableLetters.length);
      randomLetters.push(availableLetters[randomIndex]);
      availableLetters.splice(randomIndex, 1);
    }
    return randomLetters;
  });

  const handleReveal = () => {
    setRevealed(true);
    onReveal();
  };

  if (!revealed) {
    return (
      <View style={styles.gameStartContainer}>
        <View style={styles.gameInstructions}>
          <Text style={styles.gameInstructionsText}>{instructions}</Text>
        </View>
        <Ionicons name="dice" size={80} color={colors.primary} />
        <TouchableOpacity
          style={styles.gameStartButton}
          onPress={handleReveal}
          testID="start-letters-button"
        >
          <Text style={styles.gameStartButtonText}>Démarrer</Text>
          <Ionicons name="play" size={20} color={colors.textWhite} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.lettersContainer}>
      {letters.map((letter, index) => (
        <View key={index} style={styles.letterCard}>
          <Text style={styles.letterText}>{letter}</Text>
        </View>
      ))}
    </View>
  );
}

// True/False Game
function TrueFalseGame({ data }: { data?: any }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState<boolean | null>(null);
  const statements = data?.statements || [];
  const currentStatement = statements[currentIndex];

  const handleAnswer = (answer: boolean) => {
    setUserAnswer(answer);
  };

  const handleNextStatement = () => {
    if (currentIndex < statements.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setUserAnswer(null);
    }
  };

  if (!currentStatement) return null;

  const isRevealed = userAnswer !== null;
  const isCorrect = userAnswer === currentStatement.answer;
  const isLast = currentIndex === statements.length - 1;

  return (
    <View style={styles.gameContent}>
      <View style={styles.progressIndicator}>
        <Text style={styles.progressText}>
          Affirmation {currentIndex + 1} sur {statements.length}
        </Text>
      </View>
      
      <View style={styles.tfCard}>
        <Text style={styles.tfText}>{currentStatement.text}</Text>
        <View style={styles.tfButtonsContainer}>
          <TouchableOpacity
            style={[
              styles.tfButton,
              userAnswer === true && (isCorrect ? styles.tfButtonCorrect : styles.tfButtonWrong),
            ]}
            onPress={() => handleAnswer(true)}
            disabled={isRevealed}
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
            onPress={() => handleAnswer(false)}
            disabled={isRevealed}
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
              {isCorrect ? 'Bonne réponse !' : `La réponse était : ${currentStatement.answer ? 'Vrai' : 'Faux'}`}
            </Text>
          </View>
        )}
      </View>
      
      {isRevealed && !isLast && (
        <TouchableOpacity
          style={styles.tfNextButton}
          onPress={handleNextStatement}
          testID="tf-next-button"
        >
          <Text style={styles.tfNextButtonText}>Suivant</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.textWhite} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// Ranking Game
function RankingGame({
  instructions,
  data,
  onReveal,
}: {
  instructions: string;
  data?: any;
  onReveal: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const items: string[] = data?.items || [];

  const handleReveal = () => {
    setRevealed(true);
    onReveal();
  };

  if (!revealed) {
    return (
      <View style={styles.gameStartContainer}>
        <View style={styles.gameInstructions}>
          <Text style={styles.gameInstructionsText}>{instructions}</Text>
        </View>
        <Ionicons name="list" size={80} color={colors.primary} />
        <TouchableOpacity
          style={styles.gameStartButton}
          onPress={handleReveal}
          testID="start-ranking-button"
        >
          <Text style={styles.gameStartButtonText}>Démarrer</Text>
          <Ionicons name="play" size={20} color={colors.textWhite} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.gameContent}>
      {items.map((item, index) => (
        <View key={`${item}-${index}`} style={styles.rankingItemSimple}>
          <Ionicons name="ellipse" size={8} color={colors.primary} style={{ marginRight: 12 }} />
          <Text style={styles.rankingText}>{item}</Text>
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
  error,
  onComplete,
  isCompleting,
}: {
  closingWord: string;
  setClosingWord: (text: string) => void;
  error: string;
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
          <Text style={styles.closingTitle}>1 mot pour résumer ce moment en famille ?</Text>
        </View>

        <TextInput
          style={[styles.closingInput, error && styles.closingInputError]}
          placeholder="Écrivez votre mot ici..."
          placeholderTextColor={colors.textSecondary}
          value={closingWord}
          onChangeText={(text) => {
            setClosingWord(text);
          }}
          multiline
          maxLength={200}
          autoFocus
        />

        {error ? (
          <View style={styles.closingErrorContainer}>
            <Ionicons name="warning" size={18} color={colors.error} />
            <Text style={styles.closingErrorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.instructionCard}>
          <Ionicons name="heart" size={24} color={colors.accent} />
          <Text style={styles.instructionText}>
            Ce mot apparaîtra sur votre mur familial
          </Text>
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[styles.continueButton, isCompleting && styles.buttonDisabled]}
        onPress={onComplete}
        disabled={isCompleting}
        testID="close-session-button"
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
  rewardMessage,
  closingMessage,
  badgesEarned,
  hasBonusMission,
  onFinish,
}: {
  mopadoEarned: number;
  alreadyCompleted: boolean;
  rewardMessage: string;
  closingMessage: string;
  badgesEarned: string[];
  hasBonusMission: boolean;
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
            {rewardMessage ? (
              <Text style={styles.rewardMessageText}>{rewardMessage}</Text>
            ) : null}
          </View>
        )}
        
        {/* Badges earned */}
        {badgesEarned && badgesEarned.length > 0 && (
          <View style={styles.badgeEarnedCard}>
            <Ionicons name="medal" size={40} color={colors.gold} />
            <Text style={styles.badgeEarnedTitle}>Nouveau badge !</Text>
            {badgesEarned.map((badge, i) => (
              <Text key={i} style={styles.badgeEarnedName}>{badge}</Text>
            ))}
          </View>
        )}

        <View style={styles.celebrationMessage}>
          <Ionicons name="heart" size={32} color={colors.accent} />
          <Text style={styles.celebrationText}>
            {closingMessage}
          </Text>
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.continueButton} onPress={onFinish}>
        <Text style={styles.continueButtonText}>
          {hasBonusMission ? 'Voir la mission bonus' : "Retour à l'accueil"}
        </Text>
        <Ionicons name={hasBonusMission ? 'gift' : 'home'} size={20} color={colors.textWhite} />
      </TouchableOpacity>
    </View>
  );
}

// Bonus Mission Step
function BonusMissionStepContent({
  mission,
  onFinish,
}: {
  mission: string;
  onFinish: () => void;
}) {
  return (
    <View style={styles.stepContainer}>
      <ScrollView contentContainerStyle={[styles.scrollContent, styles.celebrationContent]}>
        <Ionicons name="gift" size={80} color={colors.primary} />
        <Text style={styles.bonusMissionTitle}>Mission bonus... si tu l'acceptes</Text>
        <View style={styles.bonusMissionCard}>
          <Ionicons name="sparkles" size={32} color={colors.gold} style={{ marginBottom: 12 }} />
          <Text style={styles.bonusMissionText}>{mission}</Text>
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
    paddingVertical: 14,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textWhite,
    letterSpacing: 0.3,
  },
  placeholder: {
    width: 40,
  },
  alreadyCompletedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.info,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  alreadyCompletedBannerText: {
    color: colors.textWhite,
    fontSize: 13,
    fontWeight: '600',
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
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    marginBottom: 20,
    minHeight: 280,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primaryLight,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  cardTitleContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.primary,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  cardTitleUnderline: {
    width: 40,
    height: 3,
    backgroundColor: colors.primaryLight,
    borderRadius: 2,
    marginTop: 8,
  },
  cardDecoration: {
    marginBottom: 16,
  },
  cardDecorationBottom: {
    marginBottom: 0,
    marginTop: 16,
  },
  cardIcon: {
    marginBottom: 24,
  },
  cardContent: {
    fontSize: 22,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 32,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  cardMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  cardMessageText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  gameStartContainer: {
    alignItems: 'center',
    padding: 24,
    gap: 20,
  },
  gameStartText: {
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
    fontWeight: '500',
  },
  gameStartButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gameStartButtonText: {
    color: colors.textWhite,
    fontSize: 18,
    fontWeight: '600',
  },
  tfNextButton: {
    backgroundColor: colors.secondary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    marginTop: 8,
  },
  tfNextButtonText: {
    color: colors.textWhite,
    fontSize: 15,
    fontWeight: '600',
  },
  closingInputError: {
    borderWidth: 2,
    borderColor: colors.error,
  },
  closingErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  closingErrorText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '500',
  },
  rewardMessageText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  badgeEarnedCard: {
    backgroundColor: colors.gold + '20',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
    borderWidth: 2,
    borderColor: colors.gold,
  },
  badgeEarnedTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.gold,
    marginTop: 8,
  },
  badgeEarnedName: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
    marginTop: 4,
  },
  bonusMissionTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.primary,
    marginTop: 20,
    marginBottom: 8,
  },
  bonusMissionCard: {
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 2,
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
    width: '100%',
  },
  bonusMissionText: {
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 26,
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
  rankingItemSimple: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.primaryLight,
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
