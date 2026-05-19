import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  BookOpen, 
  CheckCircle2, 
  MessageSquare, 
  Trophy, 
  ArrowRight, 
  ChevronLeft, 
  ChevronRight,
  Brain,
  Sparkles,
  BookMarked,
  Star,
  Medal,
  Zap,
  Target
} from "lucide-react";
import ReactMarkdown from "react-markdown";

// --- Types ---
interface Word {
  word: string;
  translation: string;
  definition: string;
  examples: string[];
}

interface Badge {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  achieved: boolean;
}

interface UserState {
  streak: number;
  lastActive: string; // ISO Date
  masteredWords: Word[];
  todayWords: Word[];
  dailyDone: boolean;
  totalWordsLearned: number;
  points: number;
  badges: string[]; // list of badge IDs
}

type View = "dashboard" | "learn" | "quiz" | "chat";

// --- Constants ---
const STORAGE_KEY = "lingo_day_user_state_v2";

const BADGES_CONFIG: Badge[] = [
  { id: "starter", name: "Frühaufsteher", icon: <Zap size={20} />, description: "Erste Lektion abgeschlossen", achieved: false },
  { id: "streak3", name: "Draufgänger", icon: <Trophy size={20} />, description: "3 Tage Streak erreicht", achieved: false },
  { id: "words10", name: "Wortsammler", icon: <BookMarked size={20} />, description: "10 Vokabeln gelernt", achieved: false },
  { id: "words50", name: "Sprachprofi", icon: <Brain size={20} />, description: "50 Vokabeln gelernt", achieved: false },
  { id: "points1000", name: "Millionär", icon: <Star size={20} />, description: "1000 Punkte gesammelt", achieved: false },
];

const INITIAL_STATE: UserState = {
  streak: 0,
  lastActive: "",
  masteredWords: [],
  todayWords: [],
  dailyDone: false,
  totalWordsLearned: 0,
  points: 0,
  badges: [],
};

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [userState, setUserState] = useState<UserState>(INITIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<{role: string, content: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  // --- Persistence ---
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: UserState = JSON.parse(saved);
      checkDailyRefresh(parsed);
    } else {
      fetchNewWords("Anfänger", INITIAL_STATE);
    }
  }, []);

  const saveState = (state: UserState) => {
    // Check for new badges
    const newBadges = [...state.badges];
    
    if (state.totalWordsLearned >= 1 && !newBadges.includes("starter")) newBadges.push("starter");
    if (state.streak >= 3 && !newBadges.includes("streak3")) newBadges.push("streak3");
    if (state.totalWordsLearned >= 10 && !newBadges.includes("words10")) newBadges.push("words10");
    if (state.totalWordsLearned >= 50 && !newBadges.includes("words50")) newBadges.push("words50");
    if (state.points >= 1000 && !newBadges.includes("points1000")) newBadges.push("points1000");

    const finalState = { ...state, badges: newBadges };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(finalState));
    setUserState(finalState);
  };

  const checkDailyRefresh = (state: UserState) => {
    const today = new Date().toISOString().split('T')[0];
    const lastActiveDate = state.lastActive?.split('T')[0] || "";

    if (lastActiveDate !== today) {
      let newStreak = state.streak;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (lastActiveDate === yesterdayStr) {
        newStreak += 1;
      } else if (lastActiveDate !== "") {
        newStreak = 1;
      } else {
        newStreak = 1;
      }

      fetchNewWords("Fortgeschritten", { ...state, streak: newStreak, dailyDone: false });
    } else {
      setUserState(state);
      setLoading(false);
    }
  };

  const fetchNewWords = async (level: string, currentState: UserState) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to fetch words");
      }

      const data = await res.json();
      
      if (!Array.isArray(data)) {
        throw new Error("Invalid response format: expected an array");
      }
      
      const newState = {
        ...currentState,
        todayWords: data,
        lastActive: new Date().toISOString(),
        dailyDone: false,
      };
      saveState(newState);
    } catch (error: any) {
      console.error("Failed to fetch words", error);
      setError(error.message || "Etwas ist schiefgelaufen beim Laden der Wörter.");
      // Ensure we still have a state even if fetch fails
      setUserState(prev => ({ ...prev, todayWords: prev.todayWords || [] }));
    } finally {
      setLoading(false);
    }
  };

  const handleDailyDone = (earnedPoints: number) => {
    const newState = {
      ...userState,
      dailyDone: true,
      points: userState.points + earnedPoints + 50, // 50 bonus for completion
      totalWordsLearned: userState.totalWordsLearned + userState.todayWords.length,
      masteredWords: [...userState.masteredWords, ...userState.todayWords]
    };
    saveState(newState);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const newMsg = { role: "user", content: chatInput };
    const updatedMessages = [...chatMessages, newMsg];
    setChatMessages(updatedMessages);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });
      const data = await res.json();
      setChatMessages([...updatedMessages, { role: "assistant", content: data.text }]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsChatLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 overflow-hidden relative">
        <div className="mesh-gradient"><div className="mesh-1"></div><div className="mesh-2"></div></div>
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full z-10"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans overflow-x-hidden relative">
      <div className="mesh-gradient">
        <div className="mesh-1"></div>
        <div className="mesh-2"></div>
        <div className="mesh-3"></div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 md:top-0 md:bottom-0 md:left-0 md:w-24 glass-nav border-t md:border-t-0 md:border-r z-50 flex md:flex-col items-center justify-around md:justify-center gap-10 py-6">
        <div className="hidden md:flex flex-col items-center mb-10">
          <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 font-bold text-2xl mb-2">L</div>
        </div>
        <NavButton icon={<Brain />} active={view === "dashboard"} onClick={() => setView("dashboard")} label="Home" />
        <NavButton icon={<BookOpen />} active={view === "learn"} onClick={() => setView("learn")} label="Lernen" />
        <NavButton icon={<CheckCircle2 />} active={view === "quiz"} onClick={() => setView("quiz")} label="Quiz" />
        <NavButton icon={<MessageSquare />} active={view === "chat"} onClick={() => setView("chat")} label="Tutor" />
      </nav>

      <main className="relative z-10 pb-24 md:pb-0 md:pl-24 min-h-screen">
        <AnimatePresence mode="wait">
          {view === "dashboard" && (
            <motion.section 
              key="dashboard"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              className="max-w-6xl mx-auto p-6 md:p-12"
            >
              <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <h1 className="text-5xl font-bold tracking-tight mb-3">Hi, Polyglot.</h1>
                  <p className="text-white/50 text-lg">Du hast {userState.points} Punkte und {userState.dailyDone ? 'dein heutiges Ziel erreicht!' : 'noch 5 neue Wörter.'}</p>
                </div>
                {!userState.dailyDone && (
                  <button 
                    onClick={() => setView("learn")}
                    className="px-8 py-4 bg-white text-slate-900 rounded-2xl font-bold hover:bg-slate-100 transition-all shadow-xl active:scale-95"
                  >
                    Heute lernen
                  </button>
                )}
              </header>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
                <StatCard icon={<Zap className="text-yellow-400" />} label="Punkte" value={`${userState.points}`} />
                <StatCard icon={<Trophy className="text-orange-400" />} label="Streak" value={`${userState.streak} Tage`} />
                <StatCard icon={<CheckCircle2 className="text-emerald-400" />} label="Gelernt" value={`${userState.totalWordsLearned}`} />
                <StatCard icon={<Medal className="text-indigo-400" />} label="Erfolge" value={`${userState.badges.length}`} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  <div className="glass-card p-10">
                    <div className="flex items-center justify-between mb-8">
                      <h2 className="text-2xl font-bold">Wortschatz des Tages</h2>
                      <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full border border-white/10 text-sm font-medium">
                        Level: {userState.streak > 5 ? 'Fortgeschritten' : 'Anfänger'}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {error && (
                        <div className="col-span-full p-6 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-center">
                          <p className="mb-4">{error}</p>
                          <button 
                            onClick={() => fetchNewWords("Anfänger", userState)}
                            className="px-6 py-2 bg-rose-500 text-white rounded-xl font-bold hover:bg-rose-600 transition-colors"
                          >
                            Erneut versuchen
                          </button>
                        </div>
                      )}
                      {(userState.todayWords || []).map((w, i) => (
                        <div key={w.word} className="flex flex-col justify-between p-6 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                          <div className="mb-4">
                            <span className="text-xs font-bold px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded uppercase tracking-tighter mb-4 inline-block">Wort {i+1}</span>
                            <h3 className="text-2xl font-bold">{w.word}</h3>
                            <p className="text-white/50 italic text-sm mb-3">{w.translation}</p>
                            <p className="text-white/70 text-xs line-clamp-2 italic">"{w.examples[0]}"</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="glass-card p-8">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                      <Medal className="text-indigo-400" size={20} /> Erfolge
                    </h2>
                    <div className="space-y-4">
                      {BADGES_CONFIG.map(badge => {
                        const isAchieved = userState.badges.includes(badge.id);
                        return (
                          <div key={badge.id} className={`flex items-center gap-4 p-4 rounded-2xl border ${isAchieved ? "bg-indigo-500/10 border-indigo-500/30 text-white" : "bg-white/5 border-white/10 text-white/30"}`}>
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isAchieved ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" : "bg-white/10"}`}>
                              {badge.icon}
                            </div>
                            <div>
                              <p className="text-sm font-bold">{badge.name}</p>
                              <p className="text-[10px] uppercase tracking-wider">{badge.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>
          )}

          {view === "learn" && (
            <motion.section 
              key="learn"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="max-w-4xl mx-auto p-6 md:p-12 min-h-screen flex flex-col items-center justify-center"
            >
              <LearnWords words={userState.todayWords} onComplete={() => setView("quiz")} />
            </motion.section>
          )}

          {view === "quiz" && (
            <motion.section 
              key="quiz"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl mx-auto p-6 md:p-12 min-h-screen flex flex-col items-center justify-center"
            >
              {userState.dailyDone ? (
                <div className="text-center">
                  <div className="w-24 h-24 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-8 border border-emerald-500/40">
                    <CheckCircle2 size={48} />
                  </div>
                  <h2 className="text-4xl font-bold mb-3 tracking-tight">Challenge beendet!</h2>
                  <p className="text-white/50 text-lg mb-10">Du hast wichtige Punkte für deinen Fortschritt gesammelt.</p>
                  <button 
                    onClick={() => setView("dashboard")}
                    className="px-8 py-4 bg-white text-slate-900 rounded-2xl font-bold hover:bg-slate-100 transition-colors shadow-lg"
                  >
                    Zum Dashboard
                  </button>
                </div>
              ) : (
                <QuizSession 
                  dailyWords={userState.todayWords} 
                  reviewWords={userState.masteredWords.slice(-5)}
                  onFinish={handleDailyDone} 
                />
              )}
            </motion.section>
          )}

          {view === "chat" && (
            <motion.section 
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-4xl mx-auto h-screen p-6 flex flex-col"
            >
              <header className="py-8 border-b border-white/10 mb-6">
                <h2 className="text-3xl font-bold flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                    <Sparkles className="text-indigo-400" size={20} />
                  </div>
                  Lexi AI Tutor
                </h2>
                <p className="text-white/40 mt-1">Interaktives Training und Grammatik-Unterstützung.</p>
              </header>

              <div className="flex-1 overflow-y-auto py-4 space-y-6 scrollbar-hide">
                {chatMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-white/30 space-y-4">
                    <MessageSquare size={64} className="opacity-10" />
                    <p className="text-lg">Frag mich etwas...</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-6 rounded-3xl ${msg.role === 'user' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/10 border border-white/10' : 'bg-white/10 backdrop-blur-md border border-white/10'}`}>
                      <div className="prose prose-invert prose-stone max-w-none prose-p:leading-relaxed prose-pre:bg-black/50">
                        <ReactMarkdown>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex gap-1.5 backdrop-blur-md">
                      {[0, 1, 2].map(n => (
                        <motion.div key={n} animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: n * 0.2 }} className="w-2.5 h-2.5 bg-indigo-400 rounded-full" />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="py-8">
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-2 flex items-center pr-4 focus-within:ring-2 focus-within:ring-indigo-500/40 transition-all group shadow-2xl">
                  <input 
                    type="text" 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Frag mich etwas..."
                    className="flex-1 bg-transparent px-6 py-4 outline-none placeholder:text-white/20"
                  />
                  <button 
                    onClick={handleSendMessage}
                    disabled={isChatLoading || !chatInput.trim()}
                    className="p-4 bg-white text-slate-950 rounded-2xl hover:bg-slate-200 disabled:opacity-20 transition-all shadow-lg active:scale-90"
                  >
                    <ArrowRight size={22} />
                  </button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Sub-components ---

function NavButton({ icon, active, onClick, label }: { icon: React.ReactNode, active: boolean, onClick: () => void, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`p-4 rounded-2xl flex flex-col items-center gap-2 transition-all group relative ${active ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
    >
      <div className={`p-3 rounded-xl transition-all ${active ? 'bg-indigo-500/20 ring-1 ring-indigo-500/50' : 'group-hover:bg-white/5'}`}>
        {icon}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest hidden md:block">{label}</span>
      {active && (
        <motion.div layoutId="activeNav" className="hidden md:block absolute -left-1 w-1 h-12 bg-indigo-500 rounded-full" />
      )}
    </button>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="glass-card p-8 flex items-center gap-6 hover:bg-white/20 transition-all group">
      <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/40 mb-1">{label}</div>
        <div className="text-3xl font-bold tracking-tight">{value}</div>
      </div>
    </div>
  );
}

function LearnWords({ words, onComplete }: { words: Word[], onComplete: () => void }) {
  const [index, setIndex] = useState(0);

  return (
    <div className="w-full">
      <div className="mb-10 flex items-center justify-between text-sm font-bold uppercase tracking-widest text-white/40 px-4">
        <span className="flex items-center gap-2"><BookMarked size={16} className="text-indigo-400" /> DAILY VOCAB</span>
        <span className="bg-white/10 px-3 py-1 rounded-full border border-white/10">{index + 1} / {words.length}</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div 
          key={index}
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.9 }}
          className="glass-card p-12 md:p-16 aspect-[4/5] md:aspect-[16/9] flex flex-col items-center justify-center text-center relative overflow-hidden"
        >
          <div className="text-xs font-black uppercase tracking-[0.4em] text-indigo-400 mb-10 px-6 py-2 bg-indigo-500/10 rounded-full border border-indigo-500/30">Vocabulary</div>
          <h2 className="text-7xl font-black mb-4 tracking-tighter">{words[index]?.word}</h2>
          <p className="text-3xl text-white/40 italic mb-8 font-serif">{words[index]?.translation}</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl">
            {words[index]?.examples.map((ex, i) => (
              <div key={i} className="glass-card bg-white/5 p-6 border-indigo-500/20 text-left">
                <p className="text-white/40 text-[10px] uppercase tracking-widest mb-2">Example {i+1}</p>
                <p className="text-white font-medium leading-relaxed italic">"{ex}"</p>
              </div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-12 flex items-center justify-between gap-8">
        <button 
          onClick={() => setIndex(prev => Math.max(0, prev - 1))}
          disabled={index === 0}
          className="p-6 rounded-full bg-white/5 border border-white/10 text-white disabled:opacity-10 hover:bg-white/10 transition-all hover:-translate-x-2"
        >
          <ChevronLeft size={32} />
        </button>
        {index === words.length - 1 ? (
          <button 
            onClick={onComplete}
            className="flex-1 py-7 bg-white text-slate-950 rounded-[32px] font-black text-2xl hover:bg-indigo-50 transition-all shadow-2xl active:scale-95 hover:shadow-indigo-500/20"
          >
            Quiz starten
          </button>
        ) : (
          <button 
            onClick={() => setIndex(prev => prev + 1)}
            className="p-6 rounded-full bg-white text-slate-950 hover:bg-indigo-50 transition-all active:scale-90 hover:translate-x-2"
          >
            <ChevronRight size={32} />
          </button>
        )}
      </div>
    </div>
  );
}

// --- Quiz Logic ---

type QuestionType = "mcq" | "fill" | "match";

interface Question {
  type: QuestionType;
  word: Word;
  correctAnswer: string;
  options?: string[];
  sentenceWithBlank?: string;
  definition?: string;
}

function QuizSession({ dailyWords, reviewWords, onFinish }: { dailyWords: Word[], reviewWords: Word[], onFinish: (points: number) => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [isWrong, setIsWrong] = useState(false);
  const [isShowingFeedback, setIsShowingFeedback] = useState(false);

  const questions = useMemo(() => {
    const allWords = [...dailyWords, ...reviewWords];
    const generated: Question[] = allWords.map((word, idx) => {
      // Rotate question types
      const type: QuestionType = idx % 3 === 0 ? "mcq" : idx % 3 === 1 ? "fill" : "match";
      
      if (type === "mcq") {
        const others = allWords.filter(w => w.word !== word.word).map(w => w.translation);
        const options = [word.translation, ...others.sort(() => 0.5 - Math.random()).slice(0, 3)].sort(() => 0.5 - Math.random());
        return { type, word, correctAnswer: word.translation, options };
      } else if (type === "fill") {
        const sentence = word.examples[0];
        const blanked = sentence.replace(new RegExp(word.word, 'gi'), "____");
        return { type, word, correctAnswer: word.word, sentenceWithBlank: blanked };
      } else {
        return { type, word, correctAnswer: word.word, definition: word.definition };
      }
    });
    return generated.sort(() => 0.5 - Math.random());
  }, [dailyWords, reviewWords]);

  const currentQuestion = questions[currentIndex];

  const handleSelect = (answer: string) => {
    if (isShowingFeedback) return;
    setSelected(answer);
    setIsShowingFeedback(true);

    if (answer.toLowerCase() === currentQuestion.correctAnswer.toLowerCase()) {
      setEarnedPoints(prev => prev + 20);
      setTimeout(() => next(), 1000);
    } else {
      setIsWrong(true);
      setTimeout(() => {
        setIsWrong(false);
        next();
      }, 1500);
    }
  };

  const next = () => {
    setSelected(null);
    setIsShowingFeedback(false);
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onFinish(earnedPoints);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="mb-12 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center font-bold text-indigo-400">
            {currentIndex + 1}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/40">Question</p>
            <p className="text-sm font-bold text-white/80">{currentQuestion.type === 'mcq' ? 'Translation' : currentQuestion.type === 'fill' ? 'Fill the blank' : 'Matching'}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-white/40">Points earned</p>
          <p className="text-sm font-bold text-yellow-400 flex items-center gap-1"><Zap size={14} /> {earnedPoints}</p>
        </div>
      </div>

      <div className="w-full bg-white/5 h-2 rounded-full mb-12 overflow-hidden">
        <motion.div 
          animate={{ width: `${(currentIndex / questions.length) * 100}%` }}
          className="h-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.4)]"
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div 
          key={currentIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="glass-card p-10 min-h-[400px] flex flex-col items-center justify-center text-center"
        >
          {currentQuestion.type === "mcq" && (
            <>
              <h3 className="text-4xl font-bold mb-10 tracking-tight">Was bedeutet <span className="text-indigo-400 underline decoration-indigo-500/30">"{currentQuestion.word.word}"</span>?</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {currentQuestion.options?.map(opt => (
                  <button 
                    key={opt}
                    onClick={() => handleSelect(opt)}
                    className={`p-6 rounded-2xl border-2 font-bold transition-all ${selected === opt ? (opt === currentQuestion.correctAnswer ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-rose-500/20 border-rose-500 text-rose-400") : "bg-white/5 border-white/10 hover:border-indigo-500/40 hover:bg-white/10"}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </>
          )}

          {currentQuestion.type === "fill" && (
            <>
              <p className="text-white/40 uppercase tracking-widest text-xs mb-6 px-4 py-2 border border-white/10 rounded-full">Satz vervollständigen</p>
              <h3 className="text-2xl font-bold mb-10 leading-relaxed italic text-white/90">"{currentQuestion.sentenceWithBlank}"</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {[currentQuestion.correctAnswer, ...dailyWords.filter(w => w.word !== currentQuestion.word.word).map(w => w.word)].sort(() => 0.5 - Math.random()).slice(0, 4).map(opt => (
                  <button 
                    key={opt}
                    onClick={() => handleSelect(opt)}
                    className={`p-6 rounded-2xl border-2 font-bold transition-all ${selected === opt ? (opt === currentQuestion.correctAnswer ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-rose-500/20 border-rose-500 text-rose-400") : "bg-white/5 border-white/10 hover:border-indigo-500/40 hover:bg-white/10"}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </>
          )}

          {currentQuestion.type === "match" && (
            <>
              <p className="text-white/40 uppercase tracking-widest text-xs mb-6 px-4 py-2 border border-white/10 rounded-full">Definition zuordnen</p>
              <h3 className="text-2xl font-bold mb-10 leading-relaxed text-indigo-300">"{currentQuestion.definition}"</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {[currentQuestion.correctAnswer, ...dailyWords.filter(w => w.word !== currentQuestion.word.word).map(w => w.word)].sort(() => 0.5 - Math.random()).slice(0, 4).map(opt => (
                  <button 
                    key={opt}
                    onClick={() => handleSelect(opt)}
                    className={`p-6 rounded-2xl border-2 font-bold transition-all ${selected === opt ? (opt === currentQuestion.correctAnswer ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-rose-500/20 border-rose-500 text-rose-400") : "bg-white/5 border-white/10 hover:border-indigo-500/40 hover:bg-white/10"}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </>
          )}

          {isShowingFeedback && (
            <motion.div 
              initial={{ scale: 0 }} 
              animate={{ scale: 1 }} 
              className={`absolute top-1/2 -translate-y-1/2 w-40 h-40 rounded-full flex items-center justify-center backdrop-blur-xl border-4 ${isWrong ? "border-rose-500 text-rose-500 bg-rose-500/10" : "border-emerald-500 text-emerald-500 bg-emerald-500/10"}`}
            >
              {isWrong ? <Zap size={80} /> : <CheckCircle2 size={80} />}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
