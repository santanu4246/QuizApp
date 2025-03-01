import React, { useState, useEffect, useRef } from "react";
import QuizComponent from "./QuizComponent";
import { useSocketStore } from "@/store/socketStore";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { Button } from "./button";

interface Question {
  id: string;
  questionText: string;
  options: string[];
  timeLimit: number;
}

interface QuizSessionProps {
  roomId: string;
}

const QuizSession: React.FC<QuizSessionProps> = ({ roomId }) => {
  const { socket } = useSocketStore();
  const { data: session } = useSession();
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizEnded, setQuizEnded] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [waitingTime, setWaitingTime] = useState(0);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const waitingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!socket) return;

    console.log("Setting up socket listeners for quiz in room:", roomId);
    
    // Listen for quiz start event
    socket.on("quizStart", (quizData: { 
      questions: Question[], 
      currentQuestionIndex: number,
      timeLeft: number 
    }) => {
      console.log("Quiz started with questions:", quizData);
      if (quizData && quizData.questions && quizData.questions.length > 0) {
        setQuestions(quizData.questions);
        setCurrentQuestionIndex(quizData.currentQuestionIndex);
        setTimeLeft(quizData.timeLeft);
        setQuizStarted(true);
        setIsReconnecting(false);
        
        // Clear waiting timer if it exists
        if (waitingTimerRef.current) {
          clearInterval(waitingTimerRef.current);
          waitingTimerRef.current = null;
        }
      } else {
        console.error("Received invalid quiz data:", quizData);
      }
    });

    // Listen for next question event
    socket.on("nextQuestion", (data: { questionIndex: number, timeLeft: number }) => {
      setCurrentQuestionIndex(data.questionIndex);
      setTimeLeft(data.timeLeft);
    });

    // Listen for quiz results
    socket.on("quizResults", (resultsData) => {
      console.log("Quiz results received:", resultsData);
      setResults(resultsData);
      setQuizEnded(true);
      
      // Start countdown for redirect (10 seconds)
      setRedirectCountdown(10);
      redirectTimerRef.current = setInterval(() => {
        setRedirectCountdown(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(redirectTimerRef.current!);
            router.push('/dashboard');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });
    
    // Listen for individual question results
    socket.on("questionResults", (resultData) => {
      console.log("Question result:", resultData);
      // You can use this to show feedback between questions
    });

    // Start a timer to track how long we've been waiting
    waitingTimerRef.current = setInterval(() => {
      setWaitingTime(prev => {
        // If we've been waiting for more than 5 seconds and haven't received questions,
        // request them directly
        if (prev === 5 && !quizStarted) {
          console.log("Requesting quiz questions directly");
          socket.emit("requestQuizQuestions", roomId);
        }
        return prev + 1;
      });
    }, 1000);

    return () => {
      console.log("Cleaning up socket listeners");
      socket.off("quizStart");
      socket.off("nextQuestion");
      socket.off("quizResults");
      socket.off("questionResults");
      
      if (waitingTimerRef.current) {
        clearInterval(waitingTimerRef.current);
        waitingTimerRef.current = null;
      }
      
      if (redirectTimerRef.current) {
        clearInterval(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, [socket, roomId, quizStarted, router]);

  // Request quiz questions if we've been waiting too long
  useEffect(() => {
    if (waitingTime > 10 && !quizStarted && socket) {
      console.log("Still waiting for questions after 10 seconds, requesting again");
      socket.emit("requestQuizQuestions", roomId);
      setWaitingTime(0); // Reset timer to avoid spamming requests
    }
  }, [waitingTime, quizStarted, socket, roomId]);

  const handleAnswer = (selectedOption: number) => {
    console.log(`Submitting answer: ${selectedOption} for question ${currentQuestionIndex}`);
    
    // Store the answer
    const newAnswers = [...answers];
    newAnswers[currentQuestionIndex] = selectedOption;
    setAnswers(newAnswers);

    // Send answer to server
    if (socket) {
      socket.emit("submitAnswer", {
        roomId,
        questionIndex: currentQuestionIndex,
        selectedOption,
      });
    }
  };

  const handleGoToDashboard = () => {
    if (redirectTimerRef.current) {
      clearInterval(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
    router.push('/dashboard');
  };

  if (!quizStarted) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-t-blue-500 border-b-blue-700 border-l-blue-600 border-r-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <h3 className="text-xl font-medium text-white mb-2">
            Preparing Quiz...
          </h3>
          <p className="text-gray-400">
            The quiz will start automatically when ready
          </p>
          {waitingTime > 5 && (
            <button 
              onClick={() => socket?.emit("requestQuizQuestions", roomId)}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white"
            >
              Request Questions
            </button>
          )}
        </div>
      </div>
    );
  }

  if (quizEnded) {
    // Find the winner (participant with highest score)
    const getWinner = () => {
      if (!results || !results.participants || results.participants.length === 0) return null;
      
      let highestScore = -1;
      let winners = [];
      
      for (const participant of results.participants) {
        if (participant.score > highestScore) {
          highestScore = participant.score;
          winners = [participant];
        } else if (participant.score === highestScore) {
          winners.push(participant);
        }
      }
      
      return {
        winners,
        highestScore,
        isTie: winners.length > 1
      };
    };
    
    const winnerInfo = getWinner();
    const currentUserScore = results?.participants?.find((p: any) => p.id === session?.user?.id)?.score || 0;
    const isCurrentUserWinner = winnerInfo?.winners.some((w: any) => w.id === session?.user?.id) || false;

    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-full max-w-md bg-gradient-to-b from-gray-900 to-black rounded-xl shadow-2xl border border-gray-800 p-6 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Quiz Complete!</h2>
          
          {results ? (
            <div className="space-y-6">
              {/* Winner Section */}
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                {winnerInfo?.isTie ? (
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-yellow-500/20 mb-3">
                      <Trophy className="h-6 w-6 text-yellow-500" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">It's a Tie!</h3>
                    <p className="text-gray-300 mb-3">
                      {winnerInfo.winners.map((w: any) => w.username).join(' & ')} tied with {winnerInfo.highestScore} points
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-yellow-500/20 mb-3">
                      <Trophy className="h-6 w-6 text-yellow-500" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Winner!</h3>
                    <p className="text-2xl font-bold text-yellow-400 mb-1">
                      {winnerInfo?.winners[0]?.username}
                    </p>
                    <p className="text-gray-300">
                      with {winnerInfo?.highestScore} points
                    </p>
                  </div>
                )}
              </div>
              
              <p className="text-lg text-gray-300">
                Your Score: <span className={isCurrentUserWinner ? "text-yellow-400 font-bold" : "text-white font-bold"}>
                  {currentUserScore}/{questions.length}
                </span>
              </p>
              
              <div className="grid grid-cols-2 gap-4 mt-6">
                {results.participants?.map((participant: any) => (
                  <div
                    key={participant.id}
                    className={`bg-gray-800 border ${
                      participant.id === session?.user?.id 
                        ? "border-blue-500" 
                        : winnerInfo?.winners.some((w: any) => w.id === participant.id)
                          ? "border-yellow-500"
                          : "border-gray-700"
                    } rounded-lg p-4`}
                  >
                    <p className="font-medium text-white">{participant.username}</p>
                    <p className={`text-lg font-bold ${
                      winnerInfo?.winners.some((w: any) => w.id === participant.id)
                        ? "text-yellow-400"
                        : "text-blue-400"
                    }`}>
                      {participant.score} pts
                    </p>
                  </div>
                ))}
              </div>
              
              <div className="mt-6">
                <Button 
                  onClick={handleGoToDashboard}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  Go to Dashboard {redirectCountdown !== null && `(${redirectCountdown}s)`}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-gray-400">Waiting for results...</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center p-4">
      {questions.length > 0 && currentQuestionIndex < questions.length && timeLeft !== null && (
        <QuizComponent
          question={questions[currentQuestionIndex]}
          onAnswer={handleAnswer}
          currentQuestionIndex={currentQuestionIndex}
          totalQuestions={questions.length}
          initialTimeLeft={timeLeft}
        />
      )}
    </div>
  );
};

export default QuizSession; 