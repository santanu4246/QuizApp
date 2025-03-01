"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Trophy,
  Users,
  Gamepad2,
  Plus,
  Clock,
  Users2,
  Loader2,
} from "lucide-react";

import { SignOutButton } from "../components/auth/SignOutButton";

import { io } from "socket.io-client";
import { useSocketStore } from "@/store/socketStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { DialogHeader } from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import axios from "axios";
const socket = io("http://localhost:3001");

// Define interfaces for game history
interface GameHistoryItem {
  id: string;
  topic: string;
  date: string;
  opponent: string;
  result: "win" | "loss" | "tie";
  score: string;
  opponentScore: string;
}

interface UserStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  totalPoints: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });
  const { setSocket } = useSocketStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  interface InputData {
    topic?: string;
    roomTimeLimit?: number;
    playerCount?: number;
    questionCount?: number;
    difficulty?: string;
  }
  
  const [inputedData, setInputedData] = useState<InputData>({});
  const [roomCode, setRoomCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [gameHistory, setGameHistory] = useState<GameHistoryItem[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const handleChange = (
    key: keyof typeof inputedData,
    value: string | number
  ) => {
    if (key === "playerCount") {
      setInputedData((prevData) => ({
        ...prevData,
        [key]: parseInt(value as string),
      }));
    } else {
      setInputedData((prevData) => ({
        ...prevData,
        [key]: value,
      }));
    }
  };

  useEffect(() => {
    socket.on("roomId", (roomId) => {
      router.push(`/room/${roomId}`);
    });
  }, [router, setSocket]);

  useEffect(() => {
    setSocket(socket);
  }, [setSocket]);

  // Fetch game history and user stats
  useEffect(() => {
    const fetchGameHistory = async () => {
      if (!session?.user?.id) return;
      
      setIsLoadingHistory(true);
      try {
        // Fetch user stats
        const statsResponse = await axios.get(`/api/user/${session.user.id}/stats`);
        if (statsResponse.data) {
          setUserStats(statsResponse.data);
        }
        
        // Fetch game history
        const historyResponse = await axios.get(`/api/user/${session.user.id}/game-history`);
        if (historyResponse.data && Array.isArray(historyResponse.data.games)) {
          setGameHistory(historyResponse.data.games);
        }
      } catch (error) {
        console.error("Error fetching game history:", error);
        // Set some mock data for now
        setUserStats({
          gamesPlayed: 10,
          wins: 6,
          losses: 3,
          draws: 1,
          winRate: 0.6,
          totalPoints: 45
        });
        
        setGameHistory([
          {
            id: "1",
            topic: "Science",
            date: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
            opponent: "Player123",
            result: "win",
            score: "8/10",
            opponentScore: "6/10"
          },
          {
            id: "2",
            topic: "History",
            date: new Date(Date.now() - 18000000).toISOString(), // 5 hours ago
            opponent: "QuizMaster",
            result: "loss",
            score: "6/10",
            opponentScore: "9/10"
          }
        ]);
      } finally {
        setIsLoadingHistory(false);
      }
    };
    
    fetchGameHistory();
  }, [session?.user?.id]);

  function handleCreateRoom() {
    if (
      inputedData.topic &&
      inputedData.roomTimeLimit &&
      inputedData.playerCount &&
      inputedData.questionCount &&
      inputedData.difficulty
    ) {
      setIsLoading(true);
      const roomData = {
        topic: inputedData.topic,
        roomTimeLimit: Number(inputedData.roomTimeLimit),
        playerCount: Number(inputedData.playerCount),
        questionCount: Number(inputedData.questionCount),
        difficulty: inputedData.difficulty.toUpperCase(),
        user: session?.user.id,
        username: session?.user.name,
      };
      socket.emit("createRoom", roomData);
    }
  }

  function handleJoinRoom() {
    if (roomCode) {
      setIsJoining(true);
      const roomData = {
        roomCode,
        user: session?.user.id,
        username: session?.user.name,
      };
      socket.emit("joinRoom", roomData);
    }
  }

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#040609]">
        <div className="text-lg text-zinc-200">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-main ">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Header Section */}
        <div className="mb-8 flex items-center justify-between overflow-hidden">
          <div>
            <h1 className="text-3xl font-bold text-zinc-100">Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Welcome back,{" "}
              <span className="text-blue-400">
                {session?.user?.name || "Player"}
              </span>
            </p>
          </div>
          <SignOutButton />
        </div>

        {/* Quick Actions */}
        <div className="mb-8 flex gap-4 overflow-hidden">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 text-white hover:bg-blue-700">
                <Plus className="mr-2 h-4 w-4" />
                Create Room
              </Button>
            </DialogTrigger>
            <DialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100">
              <DialogHeader>
                <DialogTitle>Create New Room</DialogTitle>
                <DialogDescription className="text-zinc-400">
                  Set up a new game room with custom settings
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4 overflow-hidden">
                <div>
                  <label className="text-sm font-medium text-zinc-300">
                    Quiz Topic
                  </label>
                  <Select
                    onValueChange={(value) => handleChange("topic", value)}
                  >
                    <SelectTrigger className="mt-1 border-zinc-700 bg-zinc-800 text-zinc-300">
                      <SelectValue placeholder="Select a topic" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General Knowledge</SelectItem>
                      <SelectItem value="science">Science</SelectItem>
                      <SelectItem value="history">History</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-300">
                    Room Time Limit
                  </label>
                  <Select
                    onValueChange={(value) =>
                      handleChange("roomTimeLimit", parseInt(value))
                    }
                  >
                    <SelectTrigger className="mt-1 border-zinc-700 bg-zinc-800 text-zinc-300">
                      <SelectValue placeholder="Select time limit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="60">1 minute</SelectItem>
                      <SelectItem value="120">2 minutes</SelectItem>
                      <SelectItem value="300">5 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-300">
                    Player Count
                  </label>
                  <Select
                    onValueChange={(value) =>
                      handleChange("playerCount", parseInt(value))
                    }
                  >
                    <SelectTrigger className="mt-1 border-zinc-700 bg-zinc-800 text-zinc-300">
                      <SelectValue placeholder="Select player count" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 Players</SelectItem>
                      <SelectItem value="3">3 Players</SelectItem>
                      <SelectItem value="4">4 Players</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-300">
                    Question Count
                  </label>
                  <Select
                    onValueChange={(value) =>
                      handleChange("questionCount", parseInt(value))
                    }
                  >
                    <SelectTrigger className="mt-1 border-zinc-700 bg-zinc-800 text-zinc-300">
                      <SelectValue placeholder="Select question count" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 Questions</SelectItem>
                      <SelectItem value="10">10 Questions</SelectItem>
                      <SelectItem value="15">15 Questions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-300">
                    Difficulty
                  </label>
                  <Select
                    onValueChange={(value) => handleChange("difficulty", value)}
                  >
                    <SelectTrigger className="mt-1 border-zinc-700 bg-zinc-800 text-zinc-300">
                      <SelectValue placeholder="Select difficulty" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleCreateRoom}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Room"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
            <DialogTrigger asChild>
              <Button className="bg-zinc-800 text-white hover:bg-zinc-700">
                <Users className="mr-2 h-4 w-4" />
                Join Room
              </Button>
            </DialogTrigger>
            <DialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100">
              <DialogHeader>
                <DialogTitle>Join Existing Room</DialogTitle>
                <DialogDescription className="text-zinc-400">
                  Enter a room code to join an existing game
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium text-zinc-300">
                    Room Code
                  </label>
                  <Input
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    placeholder="Enter room code"
                    className="mt-1 border-zinc-700 bg-zinc-800 text-zinc-300 placeholder:text-zinc-500"
                  />
                </div>
                <Button
                  onClick={handleJoinRoom}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  disabled={isJoining}
                >
                  {isJoining ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    "Join Room"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3 overflow-hidden">
          <Card className="border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-blue-500/10 p-3">
                <Trophy className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400">Win Rate</p>
                <p className="text-2xl font-bold text-zinc-100">
                  {userStats ? `${Math.round(userStats.winRate * 100)}%` : "0%"}
                </p>
              </div>
            </div>
          </Card>

          <Card className="border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-green-500/10 p-3">
                <Gamepad2 className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400">Games Played</p>
                <p className="text-2xl font-bold text-zinc-100">
                  {userStats?.gamesPlayed || 0}
                </p>
              </div>
            </div>
          </Card>

          <Card className="border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-purple-500/10 p-3">
                <Clock className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400">Total Points</p>
                <p className="text-2xl font-bold text-zinc-100">
                  {userStats?.totalPoints || 0}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Game History */}
        <Card className="border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-lg overflow-y-auto">
          <Tabs defaultValue="all" className="w-full">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-zinc-100">
                  Game History
                </h2>
                <p className="text-sm text-zinc-400">
                  Track your gaming performance
                </p>
              </div>
              <TabsList className="bg-zinc-800/50">
                <TabsTrigger
                  value="all"
                  className="text-zinc-400 data-[state=active]:bg-zinc-700/50 data-[state=active]:text-zinc-100"
                >
                  All Games
                </TabsTrigger>
                <TabsTrigger
                  value="wins"
                  className="text-zinc-400 data-[state=active]:bg-zinc-700/50 data-[state=active]:text-zinc-100"
                >
                  Wins
                </TabsTrigger>
                <TabsTrigger
                  value="losses"
                  className="text-zinc-400 data-[state=active]:bg-zinc-700/50 data-[state=active]:text-zinc-100"
                >
                  Losses
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="all" className="space-y-4">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : gameHistory.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-zinc-400">No game history yet. Play a game to see your results!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {gameHistory.map((game) => (
                    <div key={game.id} className="flex items-center justify-between rounded-lg bg-zinc-800/30 p-4 transition-colors hover:bg-zinc-800/50">
                      <div className="flex items-center gap-4">
                        <div className={`rounded-full ${
                          game.result === 'win' 
                            ? 'bg-green-500/10' 
                            : game.result === 'loss'
                              ? 'bg-red-500/10'
                              : 'bg-yellow-500/10'
                        } p-2`}>
                          <Trophy className={`h-4 w-4 ${
                            game.result === 'win' 
                              ? 'text-green-500' 
                              : game.result === 'loss'
                                ? 'text-red-500'
                                : 'text-yellow-500'
                          }`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-zinc-200">
                              vs {game.opponent}
                            </p>
                            <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                              game.result === 'win' 
                                ? 'bg-green-500/10 text-green-500' 
                                : game.result === 'loss'
                                  ? 'bg-red-500/10 text-red-500'
                                  : 'bg-yellow-500/10 text-yellow-500'
                            }`}>
                              {game.result === 'win' 
                                ? 'Victory' 
                                : game.result === 'loss'
                                  ? 'Defeat'
                                  : 'Tie'}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-400">
                            {game.topic} Quiz • {game.score} correct • Opponent: {game.opponentScore}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm text-zinc-500">{formatRelativeTime(game.date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="wins" className="space-y-4">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="space-y-3">
                  {gameHistory
                    .filter(game => game.result === 'win')
                    .map((game) => (
                      <div key={game.id} className="flex items-center justify-between rounded-lg bg-zinc-800/30 p-4 transition-colors hover:bg-zinc-800/50">
                        <div className="flex items-center gap-4">
                          <div className="rounded-full bg-green-500/10 p-2">
                            <Trophy className="h-4 w-4 text-green-500" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-zinc-200">
                                vs {game.opponent}
                              </p>
                              <span className="rounded-full bg-green-500/10 px-2 py-1 text-xs font-medium text-green-500">
                                Victory
                              </span>
                            </div>
                            <p className="text-sm text-zinc-400">
                              {game.topic} Quiz • {game.score} correct • Opponent: {game.opponentScore}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm text-zinc-500">{formatRelativeTime(game.date)}</span>
                      </div>
                    ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="losses" className="space-y-4">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="space-y-3">
                  {gameHistory
                    .filter(game => game.result === 'loss')
                    .map((game) => (
                      <div key={game.id} className="flex items-center justify-between rounded-lg bg-zinc-800/30 p-4 transition-colors hover:bg-zinc-800/50">
                        <div className="flex items-center gap-4">
                          <div className="rounded-full bg-red-500/10 p-2">
                            <Trophy className="h-4 w-4 text-red-500" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-zinc-200">
                                vs {game.opponent}
                              </p>
                              <span className="rounded-full bg-red-500/10 px-2 py-1 text-xs font-medium text-red-500">
                                Defeat
                              </span>
                            </div>
                            <p className="text-sm text-zinc-400">
                              {game.topic} Quiz • {game.score} correct • Opponent: {game.opponentScore}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm text-zinc-500">{formatRelativeTime(game.date)}</span>
                      </div>
                    ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
