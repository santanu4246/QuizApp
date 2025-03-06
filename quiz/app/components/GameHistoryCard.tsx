import { Trophy } from "lucide-react";
import { formatRelativeTime } from "../utils/dateUtils";

interface GameHistoryProps {
  game: {
    id: string;
    topic: string;
    date: string;
    opponent: string;
    result: "win" | "loss" | "tie";
    score: string;
    opponentScore: string;
  };
}

export function GameHistoryCard({ game }: GameHistoryProps) {
  // Get result label and styling consistently
  const getResultInfo = () => {
    switch (game.result) {
      case "win":
        return {
          label: "Victory",
          bgColor: "bg-green-500/10",
          textColor: "text-green-500",
          iconColor: "text-green-500"
        };
      case "loss":
        return {
          label: "Defeat",
          bgColor: "bg-red-500/10",
          textColor: "text-red-500", 
          iconColor: "text-red-500"
        };
      default:
        return {
          label: "Tie",
          bgColor: "bg-yellow-500/10",
          textColor: "text-yellow-500",
          iconColor: "text-yellow-500"
        };
    }
  };

  const { label, bgColor, textColor, iconColor } = getResultInfo();

  return (
    <div className="flex items-center justify-between rounded-lg bg-zinc-800/30 p-4 transition-colors hover:bg-zinc-800/50">
      <div className="flex items-center gap-4">
        <div className={`rounded-full ${bgColor} p-2`}>
          <Trophy className={`h-4 w-4 ${iconColor}`} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-zinc-200">
              vs {game.opponent}
            </p>
            <span className={`rounded-full ${bgColor} px-2 py-1 text-xs font-medium ${textColor}`}>
              {label}
            </span>
          </div>
          <p className="text-sm text-zinc-400">
            {game.topic} Quiz • Your score: {game.score} • Opponent: {game.opponentScore}
          </p>
        </div>
      </div>
      <span className="text-sm text-zinc-500">{formatRelativeTime(game.date)}</span>
    </div>
  );
} 