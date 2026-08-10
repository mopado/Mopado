import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/contexts/AuthContext';
import { colors } from '@/src/theme/colors';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

type Question =
  | { type: 'mcq'; question: string; answers: string[]; correct_index: number }
  | { type: 'true_false'; question: string; correct: boolean }
  | { type: 'ranking'; question: string; items: string[] };

interface QuizData {
  id: string;
  name: string;
  quiz?: { questions: Question[] };
  quiz_badge_name?: string;
  quiz_badge_description?: string;
  availability: {
    has_quiz: boolean;
    is_published: boolean;
    within_window: boolean;
    days_remaining: number;
    already_taken: boolean;
    available: boolean;
    can_take: boolean;
    total_expected: number;
    total_episodes_in_season: number;
    family_completed_in_season: number;
  };
}

// Shuffles an array (stable via seed)
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function SeasonQuizScreen() {
  const params = useLocalSearchParams<{ seasonId: string }>();
  const seasonId = params.seasonId;
  const router = useRouter();
  const { user, refreshUser } = useAuth();

  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<any[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [finished, setFinished] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    load();
  }, [seasonId, user?.id]);

  const load = async () => {
    if (!seasonId) return;
    try {
      const url = user?.id
        ? `${BACKEND_URL}/api/seasons/${seasonId}/quiz?family_id=${user.id}`
        : `${BACKEND_URL}/api/seasons/${seasonId}/quiz`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        setQuiz(data);
        const qs: Question[] = data.quiz?.questions || [];
        setAnswers(new Array(qs.length).fill(null));
      }
    } catch (e) {
      console.error('load quiz err:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const questions = quiz?.quiz?.questions || [];

  // For ranking, keep a shuffled display for each question
  const shuffledForRanking = useMemo(() => {
    return questions.map((q) =>
      q.type === 'ranking' ? shuffle(q.items.map((_, i) => i)) : null,
    );
  }, [questions]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!quiz || !quiz.availability?.has_quiz) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="alert-circle" size={64} color={colors.error} />
        <Text style={styles.emptyTitle}>Aucun quiz disponible</Text>
        <Text style={styles.emptyText}>Cette saison n'a pas encore de quiz de fin.</Text>
        <TouchableOpacity style={styles.exitBtn} onPress={() => router.back()}>
          <Text style={styles.exitBtnText}>Retour</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (quiz.availability.already_taken && !finished) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="checkmark-circle" size={72} color={colors.success} />
        <Text style={styles.emptyTitle}>Quiz déjà effectué</Text>
        <Text style={styles.emptyText}>Vous avez déjà répondu à ce quiz. Bravo !</Text>
        <TouchableOpacity style={styles.exitBtn} onPress={() => router.back()}>
          <Text style={styles.exitBtnText}>Retour</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!quiz.availability.within_window || !quiz.availability.is_published) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="time" size={64} color={colors.warning} />
        <Text style={styles.emptyTitle}>Quiz indisponible</Text>
        <Text style={styles.emptyText}>
          {quiz.availability.is_published
            ? 'La fenêtre d\'ouverture de 7 jours est terminée.'
            : 'Le quiz n\'est pas encore publié.'}
        </Text>
        <TouchableOpacity style={styles.exitBtn} onPress={() => router.back()}>
          <Text style={styles.exitBtnText}>Retour</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Intro screen
  if (!started) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.introContent}>
          <Ionicons name="school" size={100} color={colors.primary} />
          <Text style={styles.introTitle}>Quiz de fin de saison</Text>
          <Text style={styles.seasonName}>{quiz.name}</Text>
          <View style={styles.introCard}>
            <View style={styles.introRow}>
              <Ionicons name="help-circle" size={20} color={colors.primary} />
              <Text style={styles.introText}>{questions.length} questions</Text>
            </View>
            <View style={styles.introRow}>
              <Ionicons name="cash" size={20} color={colors.gold} />
              <Text style={styles.introText}>+2 Mopado$ par bonne réponse</Text>
            </View>
            {quiz.quiz_badge_name ? (
              <View style={styles.introRow}>
                <Ionicons name="ribbon" size={20} color={colors.gold} />
                <Text style={styles.introText}>
                  Badge « {quiz.quiz_badge_name} » à plus de 60% de réussite
                </Text>
              </View>
            ) : null}
            <View style={styles.introRow}>
              <Ionicons name="time" size={20} color={colors.info} />
              <Text style={styles.introText}>
                Disponible {quiz.availability.days_remaining} jour(s)
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => setStarted(true)}
            testID="quiz-start"
          >
            <Text style={styles.primaryBtnText}>Démarrer le quiz</Text>
            <Ionicons name="play" size={20} color={colors.textWhite} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={() => router.back()}>
            <Text style={styles.skipBtnText}>Plus tard</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Finished — show result
  if (finished && result) {
    const totalCorrect = result.score?.correct_count ?? 0;
    const totalQ = result.score?.total ?? questions.length;
    const pct = totalQ ? Math.round((totalCorrect / totalQ) * 100) : 0;
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.resultContent}>
          {result.passing ? (
            <>
              <Ionicons name="trophy" size={100} color={colors.gold} />
              <Text style={styles.resultTitle}>Bravo à toute la famille !</Text>
            </>
          ) : null}
          <Text style={[styles.resultScore, !result.passing && { marginTop: 20 }]}>
            {totalCorrect} bonne(s) réponse(s) ({pct}%)
          </Text>
          <View style={styles.resultCard}>
            <View style={styles.resultRow}>
              <Ionicons name="cash" size={24} color={colors.gold} />
              <Text style={styles.resultRowText}>+{result.mopado_earned} Mopado$</Text>
            </View>
            {result.badge_earned ? (
              <View style={styles.resultRow}>
                <Ionicons name="ribbon" size={24} color={colors.gold} />
                <Text style={styles.resultRowText}>Badge : {result.badge_earned}</Text>
              </View>
            ) : null}
            {!result.passing && quiz.quiz_badge_name ? (
              <Text style={styles.hintText}>
                Dommage, il fallait plus de 60% de bonnes réponses pour débloquer le badge « {quiz.quiz_badge_name} ».
              </Text>
            ) : null}
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/home')}>
            <Text style={styles.primaryBtnText}>Retour à l'accueil</Text>
            <Ionicons name="home" size={20} color={colors.textWhite} />
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Active question
  const q = questions[index];
  const isLast = index >= questions.length - 1;
  const currentAnswer = answers[index];
  const hasAnswered = (() => {
    if (currentAnswer === null || currentAnswer === undefined) return false;
    if (q.type === 'ranking') {
      return Array.isArray(currentAnswer) && currentAnswer.length === q.items.length;
    }
    return true;
  })();

  const submitAnswer = async () => {
    if (submittingRef.current) return;
    if (!isLast) {
      setShowFeedback(false);
      setIndex(index + 1);
      return;
    }
    // Last one — submit
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      // Convert ranking display order to real indices
      const finalAnswers = answers.map((a, i) => {
        const qq = questions[i];
        if (qq.type === 'ranking' && Array.isArray(a)) {
          return a; // user's answer is already the list of original indices
        }
        return a;
      });
      const r = await fetch(`${BACKEND_URL}/api/seasons/${seasonId}/quiz/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ family_id: user?.id, answers: finalAnswers }),
      });
      if (r.ok) {
        const data = await r.json();
        setResult(data);
        setFinished(true);
        await refreshUser();
      }
    } catch (e) {
      console.error('submit quiz err:', e);
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  };

  const answerLocally = (val: any) => {
    const newAns = [...answers];
    newAns[index] = val;
    setAnswers(newAns);
    // Show feedback for MCQ + True/False (immediate). Ranking: user reorders then hits Next.
    if (q.type !== 'ranking') setShowFeedback(true);
  };

  // Feedback check for the current answer (client-side preview only)
  const isCorrectPreview = (() => {
    if (!hasAnswered) return null;
    if (q.type === 'mcq') return currentAnswer === q.correct_index;
    if (q.type === 'true_false') return currentAnswer === q.correct;
    if (q.type === 'ranking') {
      if (!Array.isArray(currentAnswer) || currentAnswer.length !== q.items.length) return null;
      // Correct if user ordered items in original array order (0,1,2,...)
      return currentAnswer.every((v: number, i: number) => v === i);
    }
    return null;
  })();

  // For ranking: as soon as user picks all items, show feedback immediately
  const rankingComplete =
    q.type === 'ranking' &&
    Array.isArray(currentAnswer) &&
    currentAnswer.length === q.items.length;
  const shouldShowRankingFeedback = rankingComplete && q.type === 'ranking';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.questionScroll}>
        <Text style={styles.progressText}>Question {index + 1} sur {questions.length}</Text>
        <Text style={styles.questionText}>{q.question}</Text>

        {q.type === 'mcq' && (
          <View>
            {q.answers.map((a, i) => {
              const chosen = currentAnswer === i;
              const showAsCorrect = showFeedback && i === q.correct_index;
              const showAsWrong = showFeedback && chosen && i !== q.correct_index;
              return (
                <TouchableOpacity
                  key={i}
                  disabled={showFeedback}
                  style={[
                    styles.answerBtn,
                    chosen && styles.answerBtnChosen,
                    showAsCorrect && styles.answerBtnCorrect,
                    showAsWrong && styles.answerBtnWrong,
                  ]}
                  onPress={() => answerLocally(i)}
                >
                  <Text
                    style={[
                      styles.answerBtnText,
                      (showAsCorrect || showAsWrong) && { color: colors.textWhite },
                    ]}
                  >
                    {a}
                  </Text>
                  {showAsCorrect ? (
                    <Ionicons name="checkmark-circle" size={22} color={colors.textWhite} />
                  ) : showAsWrong ? (
                    <Ionicons name="close-circle" size={22} color={colors.textWhite} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {q.type === 'true_false' && (
          <View style={styles.tfRow}>
            {[true, false].map((val) => {
              const chosen = currentAnswer === val;
              const showAsCorrect = showFeedback && val === q.correct;
              const showAsWrong = showFeedback && chosen && val !== q.correct;
              return (
                <TouchableOpacity
                  key={String(val)}
                  disabled={showFeedback}
                  style={[
                    styles.tfBtn,
                    chosen && styles.answerBtnChosen,
                    showAsCorrect && styles.answerBtnCorrect,
                    showAsWrong && styles.answerBtnWrong,
                  ]}
                  onPress={() => answerLocally(val)}
                >
                  <Text
                    style={[
                      styles.tfBtnText,
                      (showAsCorrect || showAsWrong) && { color: colors.textWhite },
                    ]}
                  >
                    {val ? 'Vrai' : 'Faux'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {q.type === 'ranking' && (
          <RankingAnswer
            key={`ranking-${index}`}
            items={q.items}
            initialShuffle={shuffledForRanking[index] || []}
            value={currentAnswer}
            locked={rankingComplete}
            onChange={(order) => {
              const newAns = [...answers];
              newAns[index] = order;
              setAnswers(newAns);
            }}
          />
        )}

        {(showFeedback && q.type !== 'ranking') || shouldShowRankingFeedback ? (
          <View
            style={[
              styles.feedbackCard,
              isCorrectPreview ? styles.feedbackOk : styles.feedbackKo,
            ]}
          >
            <Ionicons
              name={isCorrectPreview ? 'checkmark-circle' : 'close-circle'}
              size={22}
              color={colors.textWhite}
            />
            <Text style={styles.feedbackText}>
              {isCorrectPreview ? 'Bonne réponse !' : 'Ce n\'était pas la bonne réponse.'}
            </Text>
          </View>
        ) : null}

        {shouldShowRankingFeedback && !isCorrectPreview && q.type === 'ranking' ? (
          <View style={styles.correctOrderBox}>
            <Text style={styles.correctOrderTitle}>Le bon ordre était :</Text>
            {q.items.map((item, i) => (
              <View key={i} style={styles.correctOrderRow}>
                <Text style={styles.correctOrderPos}>{i + 1}.</Text>
                <Text style={styles.correctOrderText}>{item}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <TouchableOpacity
        style={[
          styles.primaryBtn,
          (!hasAnswered || isSubmitting) && styles.btnDisabled,
        ]}
        disabled={!hasAnswered || isSubmitting}
        onPress={submitAnswer}
        testID="quiz-next-or-submit"
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.textWhite} />
        ) : (
          <>
            <Text style={styles.primaryBtnText}>
              {isLast ? 'Valider mes réponses' : 'Question suivante'}
            </Text>
            <Ionicons name="arrow-forward" size={18} color={colors.textWhite} />
          </>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

/** Simple manual ranking widget: user taps items in the order they want. */
function RankingAnswer({
  items,
  initialShuffle,
  value,
  onChange,
  locked = false,
}: {
  items: string[];
  initialShuffle: number[];
  value: number[] | null;
  onChange: (v: number[]) => void;
  locked?: boolean;
}) {
  // The shuffled pool the user picks from
  const [remaining, setRemaining] = useState<number[]>(
    value ? initialShuffle.filter((i) => !value.includes(i)) : initialShuffle,
  );
  const [chosen, setChosen] = useState<number[]>(value || []);

  const pick = (originalIdx: number) => {
    if (locked) return;
    const next = [...chosen, originalIdx];
    setChosen(next);
    setRemaining(remaining.filter((i) => i !== originalIdx));
    onChange(next);
  };
  const reset = () => {
    if (locked) return;
    setChosen([]);
    setRemaining(initialShuffle);
    onChange([]);
  };

  // Determine per-position correctness for coloring when locked
  const positionCorrect = (position: number, originalIdx: number) => {
    if (!locked) return null;
    return position === originalIdx;
  };

  return (
    <View>
      <Text style={styles.rankingHint}>
        Touchez les items dans le bon ordre (du 1er au dernier).
      </Text>
      {chosen.length > 0 ? (
        <View style={styles.rankingChosenList}>
          {chosen.map((originalIdx, position) => {
            const correct = positionCorrect(position, originalIdx);
            return (
              <View
                key={originalIdx}
                style={[
                  styles.rankingChosenItem,
                  locked && correct === true && { backgroundColor: colors.success },
                  locked && correct === false && { backgroundColor: colors.error },
                ]}
              >
                <Text style={styles.rankingChosenPos}>{position + 1}.</Text>
                <Text style={styles.rankingChosenText}>{items[originalIdx]}</Text>
                {locked ? (
                  <Ionicons
                    name={correct ? 'checkmark-circle' : 'close-circle'}
                    size={18}
                    color={colors.textWhite}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      {!locked ? (
        <View style={styles.rankingPool}>
          {remaining.map((originalIdx) => (
            <TouchableOpacity
              key={originalIdx}
              style={styles.rankingPoolItem}
              onPress={() => pick(originalIdx)}
            >
              <Text style={styles.rankingPoolItemText}>{items[originalIdx]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {chosen.length > 0 && !locked ? (
        <TouchableOpacity style={styles.resetBtn} onPress={reset}>
          <Ionicons name="refresh" size={14} color={colors.textSecondary} />
          <Text style={styles.resetBtnText}>Recommencer</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: colors.text, marginTop: 12, textAlign: 'center' },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8 },
  exitBtn: { marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 12 },
  exitBtnText: { color: colors.textWhite, fontWeight: '700' },

  introContent: { padding: 24, alignItems: 'center' },
  introTitle: { fontSize: 24, fontWeight: 'bold', color: colors.text, marginTop: 12 },
  seasonName: { fontSize: 16, color: colors.textSecondary, marginTop: 4, marginBottom: 20, fontStyle: 'italic' },
  introCard: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    gap: 12,
    marginBottom: 24,
  },
  introRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  introText: { fontSize: 15, color: colors.text, flex: 1 },
  primaryBtn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  primaryBtnText: { color: colors.textWhite, fontWeight: '700', fontSize: 16 },
  btnDisabled: { opacity: 0.5 },
  skipBtn: { alignItems: 'center', padding: 8 },
  skipBtnText: { color: colors.textSecondary, textDecorationLine: 'underline' },

  questionScroll: { padding: 20, paddingBottom: 40 },
  progressText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600', marginBottom: 8 },
  questionText: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 20, lineHeight: 28 },

  answerBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
    marginBottom: 10,
    backgroundColor: colors.background,
  },
  answerBtnChosen: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  answerBtnCorrect: { backgroundColor: colors.success, borderColor: colors.success },
  answerBtnWrong: { backgroundColor: colors.error, borderColor: colors.error },
  answerBtnText: { fontSize: 15, color: colors.text, fontWeight: '600', flex: 1 },

  tfRow: { flexDirection: 'row', gap: 12 },
  tfBtn: {
    flex: 1,
    padding: 18,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
    backgroundColor: colors.background,
  },
  tfBtnText: { fontSize: 18, fontWeight: '700', color: colors.text },

  feedbackCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feedbackOk: { backgroundColor: colors.success },
  feedbackKo: { backgroundColor: colors.error },
  feedbackText: { color: colors.textWhite, fontWeight: '700', fontSize: 15 },

  rankingHint: { fontSize: 13, color: colors.textSecondary, marginBottom: 12, fontStyle: 'italic' },
  rankingChosenList: { marginBottom: 12, gap: 6 },
  rankingChosenItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  rankingChosenPos: { color: colors.textWhite, fontWeight: 'bold', minWidth: 24 },
  rankingChosenText: { color: colors.textWhite, fontSize: 14, flex: 1 },
  rankingPool: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rankingPoolItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
    backgroundColor: colors.background,
  },
  rankingPoolItemText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  resetBtn: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  resetBtnText: { color: colors.textSecondary, fontSize: 12 },

  resultContent: { padding: 24, alignItems: 'center' },
  resultTitle: { fontSize: 24, fontWeight: 'bold', color: colors.text, marginTop: 12, textAlign: 'center' },
  resultEncouragement: {
    fontSize: 16,
    color: colors.warning,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  resultScore: { fontSize: 18, color: colors.textSecondary, marginTop: 8 },
  resultCard: {
    marginTop: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 16,
    backgroundColor: colors.backgroundTertiary,
    width: '100%',
    gap: 12,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultRowText: { fontSize: 16, color: colors.text, fontWeight: '600' },
  hintText: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' },
  correctOrderBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.backgroundTertiary,
    gap: 4,
  },
  correctOrderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  correctOrderRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  correctOrderPos: { fontWeight: 'bold', color: colors.primary, minWidth: 24 },
  correctOrderText: { color: colors.text, flex: 1, fontSize: 13 },
});
