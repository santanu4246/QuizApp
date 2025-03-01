import React, { useState, useEffect } from "react";
import { Button } from "./button";
import { Card } from "./card";
import { Timer, CheckCircle, XCircle } from "lucide-react";
import { useSocketStore } from "@/store/socketStore";

interface QuizComponentProps {
  question: {
    id: string;
    questionText: string;
    options: string[];
    timeLimit: number;
  };
  onAnswer: (selectedOption: number) => void;
  currentQuestionIndex: number;
  totalQuestions: number;
  initialTimeLeft?: number;
}

const QuizComponent: React.FC<QuizComponentProps> = ({
  question,
  onAnswer,
  currentQuestionIndex,
  totalQuestions,
  initialTimeLeft,
}) => {
  const { socket } = useSocketStore();
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(initialTimeLeft || question.timeLimit);
  const [answered, setAnswered] = useState<boolean>(false);

  // Reset state when question changes
  useEffect(() => {
    setSelectedOption(null);
    setTimeLeft(initialTimeLeft || question.timeLimit);
    setAnswered(false);
  }, [question, initialTimeLeft]);

  // Listen for next question event
  useEffect(() => {
    if (!socket) return;

    const handleNextQuestion = (data: { questionIndex: number, timeLeft: number }) => {
      if (data.questionIndex === currentQuestionIndex + 1) {
        setSelectedOption(null);
        setTimeLeft(data.timeLeft);
        setAnswered(false);
      }
    };

    socket.on("nextQuestion", handleNextQuestion);

    return () => {
      socket.off("nextQuestion", handleNextQuestion);
    };
  }, [socket, currentQuestionIndex]);

  // Timer countdown
  useEffect(() => {
    if (timeLeft <= 0 || answered) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        const newTime = prev - 1;
        if (newTime <= 0) {
          clearInterval(timer);
          setAnswered(true);
          onAnswer(-1); // -1 indicates no answer was selected
          return 0;
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, answered, onAnswer]);

  const handleOptionSelect = (index: number) => {
    if (answered) return;
    setSelectedOption(index);
  };

  const handleSubmit = () => {
    if (selectedOption === null || answered) return;
    
    setAnswered(true);
    onAnswer(selectedOption);
  };

  // Calculate progress percentage
  const progressPercentage = (timeLeft / question.timeLimit) * 100;

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Question header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="text-sm font-medium text-gray-400">
          Question {currentQuestionIndex + 1} of {totalQuestions}
        </div>
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium text-amber-500">
            {timeLeft}s
          </span>
        </div>
      </div>

      {/* Timer bar */}
      <div className="w-full h-2 bg-gray-800 rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-1000 ease-linear"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {/* Question card */}
      <Card className="mb-6 p-6 border-gray-800 bg-gray-900">
        <h3 className="text-xl font-medium text-white mb-2">
          {question.questionText}
        </h3>
      </Card>

      {/* Options */}
      <div className="grid grid-cols-1 gap-3">
        {question.options.map((option, index) => (
          <button
            key={index}
            onClick={() => handleOptionSelect(index)}
            className={`p-4 rounded-lg border text-left transition-all ${
              selectedOption === index
                ? "border-blue-500 bg-blue-500/20 text-white"
                : "border-gray-800 bg-gray-900 text-gray-300 hover:border-gray-700 hover:bg-gray-800"
            } ${answered ? "cursor-not-allowed" : "cursor-pointer"}`}
            disabled={answered}
          >
            <div className="flex items-center">
              <div
                className={`flex-shrink-0 w-6 h-6 rounded-full mr-3 flex items-center justify-center ${
                  selectedOption === index
                    ? "bg-blue-500 text-white"
                    : "bg-gray-800 text-gray-400"
                }`}
              >
                {String.fromCharCode(65 + index)}
              </div>
              <span>{option}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Submit button */}
      <div className="mt-6 flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={selectedOption === null || answered}
          className={`px-6 ${
            selectedOption === null || answered
              ? "bg-gray-700 text-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          Submit Answer
        </Button>
      </div>
    </div>
  );
};

export default QuizComponent; 