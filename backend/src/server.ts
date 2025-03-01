import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { PORT } from "./config";
import { createRoomData, joinRoom, storeQuizResults } from "./utils";
import axios from "axios";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// Enhanced room type to match client expectations
interface EnhancedRoomData {
  id: string;
  topic: string;
  roomTimeLimit: number;
  questionCount: number;
  difficulty: string;
  currentParticipants: number;
  maxParticipants: number;
  status: string;
  participants: Array<{
    id: string;
    username: string;
  }>;
}

// Sample MCQ questions for demo
const demoQuestions = [
  {
    id: "q1",
    questionText: "What is the capital of France?",
    options: ["London", "Berlin", "Paris", "Madrid"],
    correctOption: 2,
    timeLimit: 15,
  },
  {
    id: "q2",
    questionText: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Saturn"],
    correctOption: 1,
    timeLimit: 15,
  },
  {
    id: "q3",
    questionText: "What is the largest mammal?",
    options: ["Elephant", "Giraffe", "Blue Whale", "Hippopotamus"],
    correctOption: 2,
    timeLimit: 15,
  },
  {
    id: "q4",
    questionText: "Which element has the chemical symbol 'O'?",
    options: ["Gold", "Oxygen", "Osmium", "Oganesson"],
    correctOption: 1,
    timeLimit: 15,
  },
  {
    id: "q5",
    questionText: "Who painted the Mona Lisa?",
    options: ["Vincent van Gogh", "Pablo Picasso", "Leonardo da Vinci", "Michelangelo"],
    correctOption: 2,
    timeLimit: 15,
  }
];

// Store for rooms and quiz data
const rooms: Record<string, EnhancedRoomData> = {};
const quizResults: Record<string, Record<string, { score: number, answers: number[] }>> = {};
// Store active quizzes and their questions
const activeQuizzes: Record<string, any[]> = {};
// Store question timers and states
const roomTimers: Record<string, {
  currentQuestionIndex: number,
  timer: NodeJS.Timeout | null,
  startTime: number
}> = {};

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  socket.emit("initial___SOCKET___Connection", socket.id);

  // New event to request quiz questions directly
  socket.on("requestQuizQuestions", (roomId) => {
    console.log(`Player ${socket.id} requesting quiz questions for room ${roomId}`);
    
    if (activeQuizzes[roomId]) {
      console.log(`Sending quiz questions to player ${socket.id}`);
      const currentState = roomTimers[roomId];
      const timeElapsed = Date.now() - currentState.startTime;
      const timeLeft = Math.max(0, demoQuestions[currentState.currentQuestionIndex].timeLimit * 1000 - timeElapsed);
      
      socket.emit("quizStart", { 
        questions: activeQuizzes[roomId],
        currentQuestionIndex: currentState.currentQuestionIndex,
        timeLeft: Math.ceil(timeLeft / 1000)
      });
    } else {
      console.log(`No active quiz found for room ${roomId}`);
    }
  });

  socket.on("createRoom", async (msg) => {
    try {
      const roomId = generateRandomId(6);
      rooms[roomId] = {
        id: roomId,
        topic: msg.topic,
        roomTimeLimit: msg.roomTimeLimit,
        questionCount: msg.questionCount,
        difficulty: msg.difficulty,
        currentParticipants: 1,
        maxParticipants: Number(msg.playerCount),
        status: "WAITING",
        participants: [{
          id: msg.user,
          username: msg.username || 'Anonymous'
        }]
      };

      const result = await createRoomData(roomId, { ...msg, user: msg.user });
      socket.join(roomId);
      socket.emit("roomId", roomId);
      io.in(roomId).emit("updatePlayers", rooms[roomId]);
    } catch (error) {
      socket.emit("roomError", error instanceof Error ? error.message : "Failed to create room");
    }
  });

  socket.on("joinRoom", async (roomData) => {
    const { roomCode, user, username } = roomData;

    if (rooms[roomCode]) {
      // Check if room is full
      if (rooms[roomCode].participants.length >= rooms[roomCode].maxParticipants) {
        socket.emit("roomError", "Room is full");
        return;
      }

      // Add new participant
      rooms[roomCode].participants.push({
        id: user,
        username: username || 'Anonymous'
      });
      rooms[roomCode].currentParticipants = rooms[roomCode].participants.length;

      await joinRoom(roomCode, user);
      socket.join(roomCode);

      // Emit updated room data to all clients in the room
      io.in(roomCode).emit("updatePlayers", rooms[roomCode]);
      socket.emit("roomId", roomCode);

      // Check if room is now full and start the game
      if (rooms[roomCode].participants.length === rooms[roomCode].maxParticipants) {
        // If room is full, update status to ACTIVE
        rooms[roomCode].status = "ACTIVE";
        io.in(roomCode).emit("updatePlayers", rooms[roomCode]);
        
        // Notify all clients that game has started
        io.in(roomCode).emit("gameStart");
        
        // Start the quiz with a delay to ensure all clients have received the gameStart event
        setTimeout(() => {
          startQuiz(roomCode);
        }, 1000);
      } else if (rooms[roomCode].status === "ACTIVE" && activeQuizzes[roomCode]) {
        // If game already started, send game start event to the new player
        socket.emit("gameStart");
        
        // Send quiz questions to the new player
        setTimeout(() => {
          socket.emit("quizStart", { questions: activeQuizzes[roomCode] });
        }, 1000);
      }
    } else {
      socket.emit("roomError", "Room not found");
    }
  });

  // Handle answer submission
  socket.on("submitAnswer", ({ roomId, questionIndex, selectedOption }) => {
    if (!quizResults[roomId]) {
      quizResults[roomId] = {};
    }
    
    if (!quizResults[roomId][socket.id]) {
      quizResults[roomId][socket.id] = {
        score: 0,
        answers: []
      };
    }
    
    // Store the answer
    quizResults[roomId][socket.id].answers[questionIndex] = selectedOption;
    
    // Check if answer is correct
    if (selectedOption === demoQuestions[questionIndex].correctOption) {
      quizResults[roomId][socket.id].score += 1;
    }
    
    // Check if all participants have answered this question
    const room = rooms[roomId];
    const allAnswered = room.participants.every(participant => {
      return quizResults[roomId][participant.id]?.answers[questionIndex] !== undefined;
    });
    
    // If all participants have answered, move to next question immediately
    if (allAnswered) {
      clearQuestionTimer(roomId);
      handleQuestionEnd(roomId, questionIndex);
    }
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected", socket.id);

    // Remove user from all rooms they were in
    Object.entries(rooms).forEach(([roomId, room]) => {
      const index = room.participants.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        room.participants.splice(index, 1);
        room.currentParticipants = room.participants.length;

        if (room.participants.length === 0) {
          delete rooms[roomId];
          delete activeQuizzes[roomId];
          clearQuestionTimer(roomId);
        } else {
          io.in(roomId).emit("updatePlayers", room);
        }
      }
    });
  });
});

// Function to start the quiz
function startQuiz(roomId: string) {
  if (!rooms[roomId]) return;
  
  console.log(`Starting quiz for room ${roomId}`);
  
  // Initialize quiz results for this room
  quizResults[roomId] = {};
  
  // Select questions based on room settings
  const questions = demoQuestions.slice(0, rooms[roomId].questionCount || 5);
  
  // Send questions without correct answers
  const clientQuestions = questions.map(q => ({
    id: q.id,
    questionText: q.questionText,
    options: q.options,
    timeLimit: q.timeLimit
  }));
  
  // Store the questions for this quiz
  activeQuizzes[roomId] = clientQuestions;
  
  // Initialize room timer state
  roomTimers[roomId] = {
    currentQuestionIndex: 0,
    timer: null,
    startTime: Date.now()
  };
  
  // Start the first question timer
  startQuestionTimer(roomId);
  
  // Send to all clients in the room
  console.log(`Sending quiz questions to all players in room ${roomId}`);
  io.in(roomId).emit("quizStart", { 
    questions: clientQuestions,
    currentQuestionIndex: 0,
    timeLeft: questions[0].timeLimit
  });
}

// Function to start timer for current question
function startQuestionTimer(roomId: string) {
  const currentState = roomTimers[roomId];
  const currentQuestion = demoQuestions[currentState.currentQuestionIndex];
  
  // Clear any existing timer
  clearQuestionTimer(roomId);
  
  // Set start time
  currentState.startTime = Date.now();
  
  // Start new timer
  currentState.timer = setTimeout(() => {
    handleQuestionEnd(roomId, currentState.currentQuestionIndex);
  }, currentQuestion.timeLimit * 1000);
}

// Function to clear question timer
function clearQuestionTimer(roomId: string) {
  const timerState = roomTimers[roomId];
  if (timerState?.timer) {
    clearTimeout(timerState.timer);
    timerState.timer = null;
  }
}

// Function to handle question end
function handleQuestionEnd(roomId: string, questionIndex: number) {
  const room = rooms[roomId];
  if (!room) return;

  // Send question results
  io.in(roomId).emit("questionResults", {
    questionIndex,
    correctOption: demoQuestions[questionIndex].correctOption,
    participantAnswers: room.participants.map(participant => ({
      id: participant.id,
      username: participant.username,
      selectedOption: quizResults[roomId][participant.id]?.answers[questionIndex] ?? -1,
      isCorrect: quizResults[roomId][participant.id]?.answers[questionIndex] === demoQuestions[questionIndex].correctOption
    }))
  });

  // Check if this was the last question
  if (questionIndex === demoQuestions.length - 1) {
    // Send final results
    io.in(roomId).emit("quizResults", {
      participants: room.participants.map(participant => ({
        id: participant.id,
        username: participant.username,
        score: quizResults[roomId][participant.id]?.score || 0
      }))
    });
    
    // Clean up room timers
    delete roomTimers[roomId];
  } else {
    // Move to next question after a short delay
    setTimeout(() => {
      const nextIndex = questionIndex + 1;
      roomTimers[roomId].currentQuestionIndex = nextIndex;
      startQuestionTimer(roomId);
      
      // Notify all clients to move to next question
      io.in(roomId).emit("nextQuestion", {
        questionIndex: nextIndex,
        timeLeft: demoQuestions[nextIndex].timeLimit
      });
    }, 3000); // 3 second delay between questions
  }
}

// Function to update room status in database
async function updateRoomStatus(roomId: string, status: string) {
  try {
    await axios.patch(`http://localhost:3000/api/room/${roomId}/status`, {
      status
    });
  } catch (error) {
    console.error("Error updating room status:", error);
  }
}

// Function to store quiz questions in database
async function storeQuizQuestions(roomId: string, questions: any[]) {
  try {
    await axios.post(`http://localhost:3000/api/room/${roomId}/questions`, {
      questions
    });
  } catch (error) {
    console.error("Error storing quiz questions:", error);
  }
}

// Function to store question answers in database
async function storeQuestionAnswers(roomId: string, questionIndex: number, answers: any[]) {
  try {
    await axios.post(`http://localhost:3000/api/room/${roomId}/answers`, {
      questionIndex,
      answers
    });
  } catch (error) {
    console.error("Error storing question answers:", error);
  }
}

server.listen(PORT, () => {
  console.log(`Server is listening at http://localhost:${PORT}`);
});

function generateRandomId(length: number): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters[Math.floor(Math.random() * characters.length)];
  }
  return result;
}