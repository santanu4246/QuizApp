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
const socket = io("http://localhost:3001");

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
                      <SelectValue placeholder="Select room time limit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="300">5 Minutes</SelectItem>
                      <SelectItem value="600">10 Minutes</SelectItem>
                      <SelectItem value="900">15 Minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-300">
                    Number of Questions
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
                    Player Limit
                  </label>
                  <Select
                    onValueChange={(value) => handleChange("playerCount", Number(value))}
                  >
                    <SelectTrigger className="mt-1 border-zinc-700 bg-zinc-800 text-zinc-300">
                      <SelectValue placeholder="Select player limit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 Players</SelectItem>
                      <SelectItem value="4">4 Players</SelectItem>
                      <SelectItem value="6">6 Players</SelectItem>
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
                  disabled={isLoading || isJoining}
                  onClick={handleCreateRoom}
                  className="w-full bg-blue-600 text-white hover:bg-blue-700"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    "Create Room"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-zinc-700 text-black">
                <Users2 className="mr-2 h-4 w-4" />
                Join Room
              </Button>
            </DialogTrigger>
            <DialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100">
              <DialogHeader>
                <DialogTitle>Join Room</DialogTitle>
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
                    onChange={(e) => setRoomCode(e.target.value)}
                    className="mt-1 border-zinc-700 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500"
                    placeholder="Enter 6-digit room code"
                  />
                </div>
                <Button
                  disabled={isJoining || isLoading}
                  onClick={handleJoinRoom}
                  className="w-full bg-blue-600 text-white hover:bg-blue-700"
                >
                  {isJoining ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    "Join Room"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Grid */}
        <div className="mb-8 grid gap-6 md:grid-cols-4">
          <Card className="border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-blue-500/10 p-3">
                <Gamepad2 className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400">Total Games</p>
                <p className="text-2xl font-bold text-zinc-100">42</p>
              </div>
            </div>
          </Card>

          <Card className="border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-green-500/10 p-3">
                <Trophy className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400">Win Rate</p>
                <p className="text-2xl font-bold text-zinc-100">65%</p>
              </div>
            </div>
          </Card>

          <Card className="border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-purple-500/10 p-3">
                <Clock className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400">Avg. Time</p>
                <p className="text-2xl font-bold text-zinc-100">45s</p>
              </div>
            </div>
          </Card>

          <Card className="border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-orange-500/10 p-3">
                <Users className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400">
                  Total Rivals
                </p>
                <p className="text-2xl font-bold text-zinc-100">138</p>
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
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-zinc-800/30 p-4 transition-colors hover:bg-zinc-800/50">
                  <div className="flex items-center gap-4">
                    <div className="rounded-full bg-green-500/10 p-2">
                      <Trophy className="h-4 w-4 text-green-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-zinc-200">
                          vs Player123
                        </p>
                        <span className="rounded-full bg-green-500/10 px-2 py-1 text-xs font-medium text-green-500">
                          Victory
                        </span>
                      </div>
                      <p className="text-sm text-zinc-400">
                        Science Quiz • 8/10 correct
                      </p>
                    </div>
                  </div>
                  <span className="text-sm text-zinc-500">2h ago</span>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-zinc-800/30 p-4 transition-colors hover:bg-zinc-800/50">
                  <div className="flex items-center gap-4">
                    <div className="rounded-full bg-red-500/10 p-2">
                      <Trophy className="h-4 w-4 text-red-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-zinc-200">
                          vs QuizMaster
                        </p>
                        <span className="rounded-full bg-red-500/10 px-2 py-1 text-xs font-medium text-red-500">
                          Defeat
                        </span>
                      </div>
                      <p className="text-sm text-zinc-400">
                        History Quiz • 6/10 correct
                      </p>
                    </div>
                  </div>
                  <span className="text-sm text-zinc-500">5h ago</span>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="wins">
              {/* Similar structure for wins */}
            </TabsContent>

            <TabsContent value="losses">
              {/* Similar structure for losses */}
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
