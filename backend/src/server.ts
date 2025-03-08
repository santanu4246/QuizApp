import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { PORT } from "./config";
import { createRoomData, joinRoom } from "./utils";
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
    timeLimit: 30,
  },
  {
    id: "q2",
    questionText: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Saturn"],
    correctOption: 1,
    timeLimit: 30,
  },
  {
    id: "q3",
    questionText: "What is the largest mammal?",
    options: ["Elephant", "Giraffe", "Blue Whale", "Hippopotamus"],
    correctOption: 2,
    timeLimit: 30,
  },
  {
    id: "q4",
    questionText: "Which element has the chemical symbol 'O'?",
    options: ["Gold", "Oxygen", "Osmium", "Oganesson"],
    correctOption: 1,
    timeLimit: 30,
  },
  {
    id: "q5",
    questionText: "Who painted the Mona Lisa?",
    options: ["Vincent van Gogh", "Pablo Picasso", "Leonardo da Vinci", "Michelangelo"],
    correctOption: 2,
    timeLimit: 30,
  }
];

// Store for rooms and quiz data
const rooms: Record<string, EnhancedRoomData> = {};
const quizResults: Record<string, Record<string, { score: number, answers: number[], previousScore?: number }>> = {};
// Store active quizzes and their questions
const activeQuizzes: Record<string, any[]> = {};
// Store question timers and states
const roomTimers: Record<string, {
  currentQuestionIndex: number,
  timer: NodeJS.Timeout | null,
  startTime: number,
  timerId?: NodeJS.Timeout,
  syncTimerId?: NodeJS.Timeout | null
}> = {};

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  socket.emit("initial___SOCKET___Connection", socket.id);

  // New event to request quiz questions directly
  socket.on("requestQuizQuestions", (roomId) => {
    console.log(`Player ${socket.id} requesting quiz questions for room ${roomId}`);

    // Make sure player is in the room
    socket.join(roomId);

    if (activeQuizzes[roomId]) {
      console.log(`Sending quiz questions to player ${socket.id}`);
      const currentState = roomTimers[roomId];
      
      if (!currentState) {
        console.log(`No timer state found for room ${roomId}, sending questions without time info`);
        socket.emit("quizStart", {
          questions: activeQuizzes[roomId],
          currentQuestionIndex: 0,
          timeLeft: 30 // Updated default time to 30 seconds
        });
        return;
      }
      
      // Get the current question's time limit (default 30 seconds)
      const currentQuestion = activeQuizzes[roomId]?.[currentState.currentQuestionIndex] || 
                             demoQuestions[currentState.currentQuestionIndex];
      const fullTimeLimit = currentQuestion.timeLimit || 30;
      
      // Calculate elapsed time since question started
      const timeElapsed = Date.now() - currentState.startTime;
      const timeLeft = Math.max(0, fullTimeLimit * 1000 - timeElapsed);
      
      console.log(`Late-joining player in room ${roomId}: Question ${currentState.currentQuestionIndex}, Time left: ${Math.ceil(timeLeft / 1000)}s of ${fullTimeLimit}s`);

      // Also send current question state directly to ensure client has latest question
      socket.emit("nextQuestion", {
        questionIndex: currentState.currentQuestionIndex,
        timeLeft: Math.ceil(timeLeft / 1000),
        totalQuestions: activeQuizzes[roomId]?.length || demoQuestions.length
      });
      
      // Send quiz questions to the player immediately
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

        // Start the quiz with a minimal delay to ensure all clients have received the gameStart event
        setTimeout(() => {
          startQuiz(roomCode);
        }, 500); // Reduced from 1000ms to 500ms for faster start
      } else if (rooms[roomCode].status === "ACTIVE" && activeQuizzes[roomCode]) {
        // If game already started, send game start event to the new player
        socket.emit("gameStart");

        // Get the current quiz state
        const currentState = roomTimers[roomCode];
        
        if (currentState) {
          // Get the current question's time limit (default 30 seconds)
          const currentQuestion = activeQuizzes[roomCode]?.[currentState.currentQuestionIndex] || 
                                 demoQuestions[currentState.currentQuestionIndex];
          const fullTimeLimit = currentQuestion.timeLimit || 30;
          
          // Calculate elapsed time since question started
          const timeElapsed = Date.now() - currentState.startTime;
          const timeLeft = Math.max(0, fullTimeLimit * 1000 - timeElapsed);
          
          console.log(`Late-joining player in room ${roomCode}: Question ${currentState.currentQuestionIndex}, Time left: ${Math.ceil(timeLeft / 1000)}s of ${fullTimeLimit}s`);
          
          // Send quiz questions to the new player with accurate time information immediately (no delay)
          socket.emit("quizStart", {
            questions: activeQuizzes[roomCode],
            currentQuestionIndex: currentState.currentQuestionIndex,
            timeLeft: Math.ceil(timeLeft / 1000)
          });
        } else {
          // Fallback if no timer state found
          socket.emit("quizStart", { 
            questions: activeQuizzes[roomCode],
            currentQuestionIndex: 0,
            timeLeft: 30 // Default to 30 seconds
          });
        }
      }
    } else {
      socket.emit("roomError", "Room not found");
    }
  });

  // Handle answer submission
  socket.on("submitAnswer", ({ roomId, questionIndex, selectedOption, userId }) => {
    if (!quizResults[roomId]) {
      quizResults[roomId] = {};
    }
    
    if (!quizResults[roomId][userId]) {
      quizResults[roomId][userId] = {
        score: 0,
        answers: [],
        previousScore: 0
      };
    }

    // Get the current question
    const currentQuestion = activeQuizzes[roomId]?.[questionIndex] || demoQuestions[questionIndex];
    if (!currentQuestion) {
      console.error(`Question not found for index: ${questionIndex}`);
      return;
    }

    // Store the answer
    quizResults[roomId][userId].answers[questionIndex] = selectedOption;

    // Verify the selected option is within valid range
    const isValidOption = selectedOption >= 0 && selectedOption < currentQuestion.options.length;
    
    // Check if answer is correct
    const isCorrect = isValidOption && selectedOption === currentQuestion.correctOption;
    
    // Fixed 10 points for correct answers, 0 for incorrect
    const pointsEarned = isCorrect ? 10 : 0;
    
    // Update user's score
    if (isCorrect) {
      quizResults[roomId][userId].score += pointsEarned;
      console.log(`User ${userId} answered correctly for question ${questionIndex}, earned ${pointsEarned} points`);
    } else {
      console.log(`User ${userId} answered incorrectly for question ${questionIndex}. Selected: ${selectedOption}, Correct: ${currentQuestion.correctOption}`);
    }

    // Store previous score for point calculation in question results
    quizResults[roomId][userId].previousScore = quizResults[roomId][userId].score - pointsEarned;

    // Store in database
    storeQuestionAnswers(roomId, questionIndex, selectedOption, userId, isCorrect);

    // Send immediate feedback to the user who answered
    socket.emit("answerFeedback", {
      questionIndex,
      selectedOption,
      isCorrect,
      correctOption: currentQuestion.correctOption,
      pointsEarned
    });

    // Check if all participants have answered this question
    const room = rooms[roomId];
    const allAnswered = room?.participants?.every(participant => {
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

// Function to start a quiz for a room
function startQuiz(roomId: string) {
  console.log(`Starting quiz for room ${roomId}`);
  
  // Check if the room exists
  if (!rooms[roomId]) {
    console.error(`Room ${roomId} not found when starting quiz`);
    return;
  }
  
  // Update room status to IN_GAME
  updateRoomStatus(roomId, "IN_GAME");
  
  // Ensure API routes exist for this room
  ensureApiRoutesExist(roomId);
  
  // Initialize quiz questions if not already done
  if (!activeQuizzes[roomId]) {
    // Get the number of questions from room settings
    const questionCount = rooms[roomId].questionCount || 5;
    
    // Select questions based on room settings (limit to the requested number)
    const selectedQuestions = demoQuestions.slice(0, questionCount);
    
    // Store the selected questions for this quiz
    activeQuizzes[roomId] = selectedQuestions;
    
    // Store questions in database
    storeQuizQuestions(roomId, selectedQuestions);
  }
  
  // Initialize quiz results
  if (!quizResults[roomId]) {
    quizResults[roomId] = {};
    
    // Initialize results for each participant
    rooms[roomId].participants.forEach(participant => {
      quizResults[roomId][participant.id] = {
        score: 0,
        answers: [],
        previousScore: 0
      };
    });
  }
  
  // Start the first question timer
  startQuestionTimer(roomId);
}

// Function to start the timer for a question
function startQuestionTimer(roomId: string) {
  // Clear any existing timer
  clearQuestionTimer(roomId);
  
  // Get the room
  const room = rooms[roomId];
  if (!room) {
    console.error(`Room ${roomId} not found when starting question timer`);
    return;
  }
  
  // Initialize or increment the question index
  if (!roomTimers[roomId]) {
    roomTimers[roomId] = {
      currentQuestionIndex: 0,
      timer: null,
      startTime: Date.now()
    };
  } else {
    roomTimers[roomId].currentQuestionIndex = roomTimers[roomId].currentQuestionIndex + 1;
    roomTimers[roomId].startTime = Date.now();
  }
  
  const currentIndex = roomTimers[roomId].currentQuestionIndex;
  
  // Get the current question
  const currentQuestion = activeQuizzes[roomId]?.[currentIndex] || demoQuestions[currentIndex];
  if (!currentQuestion) {
    console.error(`Question not found for index: ${currentIndex}`);
    return;
  }
  
  // Get the time limit for this question - changed default from 15 to 30 seconds
  const timeLimit = currentQuestion.timeLimit || 30;
  
  console.log(`Starting timer for question ${currentIndex} in room ${roomId} with time limit ${timeLimit}s`);
  
  // Notify all clients to move to this question
  io.in(roomId).emit("nextQuestion", {
    questionIndex: currentIndex,
    timeLeft: timeLimit,
    totalQuestions: activeQuizzes[roomId]?.length || demoQuestions.length
  });
  
  // For the first question, also emit a quizStart event with full question details
  if (currentIndex === 0) {
    const questions = activeQuizzes[roomId] || demoQuestions;
    io.in(roomId).emit("quizStart", {
      questions: questions,
      currentQuestionIndex: 0,
      timeLeft: timeLimit  // Make sure we send the full time limit
    });
  }
  
  // Set the timer to end the question after the time limit
  roomTimers[roomId].timer = setTimeout(() => {
    console.log(`Time's up for question ${currentIndex} in room ${roomId}`);
    handleQuestionEnd(roomId, currentIndex);
  }, timeLimit * 1000);
  
  // Send time updates more frequently (every 500ms) for better synchronization
  let secondsRemaining = timeLimit;
  let lastUpdateTime = Date.now();
  
  const timeUpdateInterval = setInterval(() => {
    const now = Date.now();
    const elapsed = (now - lastUpdateTime) / 1000;
    lastUpdateTime = now;
    
    secondsRemaining -= elapsed;
    
    if (secondsRemaining <= 0) {
      clearInterval(timeUpdateInterval);
      return;
    }
    
    // Send time update to all clients
    io.in(roomId).emit("timeUpdate", {
      questionIndex: currentIndex,
      timeLeft: Math.ceil(secondsRemaining)
    });
  }, 500); // Update every 500ms instead of 1000ms for better precision
  
  // Store the interval ID so we can clear it later
  roomTimers[roomId].syncTimerId = timeUpdateInterval;
}

// Function to clear the question timer
function clearQuestionTimer(roomId: string) {
  const currentState = roomTimers[roomId];
  if (!currentState) return;
  
  // Clear the main question timer
  if (currentState.timer) {
    clearTimeout(currentState.timer);
    currentState.timer = null;
  }
  
  // Clear the sync timer
  if (currentState.syncTimerId) {
    clearInterval(currentState.syncTimerId);
    currentState.syncTimerId = null;
  }
}

// Function to handle the end of a question
function handleQuestionEnd(roomId: string, questionIndex: number) {
  const room = rooms[roomId];
  if (!room) {
    console.error(`Room ${roomId} not found when handling question end`);
    return;
  }

  // Get the current question
  const currentQuestion = activeQuizzes[roomId]?.[questionIndex] || demoQuestions[questionIndex];
  if (!currentQuestion) {
    console.error(`Question not found for index: ${questionIndex}`);
    return;
  }

  // Prepare participant answers for the results
  const participantAnswers = room.participants.map(participant => {
    const userResults = quizResults[roomId]?.[participant.id];
    const selectedOption = userResults?.answers[questionIndex];
    const isCorrect = selectedOption === currentQuestion.correctOption;
    
    // Calculate points for this question
    let pointsForThisQuestion = 0;
    if (isCorrect) {
      // Fixed 10 points for correct answers
      pointsForThisQuestion = 10;
      
      // Store the current score as previous score for next calculation
      if (userResults) {
        userResults.previousScore = userResults.score;
      }
    }
    
    return {
      participantId: participant.id,
      username: participant.username,
      selectedOption: selectedOption !== undefined ? selectedOption : null,
      isCorrect: isCorrect,
      pointsEarned: pointsForThisQuestion
    };
  });

  // Send question results to all clients in the room
  io.in(roomId).emit("questionResults", {
    questionIndex,
    correctOption: currentQuestion.correctOption,
    participantAnswers,
    isLastQuestion: questionIndex === (activeQuizzes[roomId]?.length || demoQuestions.length) - 1
  });

  // If this was the last question, end the quiz
  if (questionIndex === (activeQuizzes[roomId]?.length || demoQuestions.length) - 1) {
    // Calculate final results
    const finalResults: Record<string, any> = {};
    
    // Process each participant's results
    room.participants.forEach(participant => {
      // Get or initialize user results
      const userResults = quizResults[roomId]?.[participant.id] || { score: 0, answers: [], previousScore: 0 };
      
      // Clean up answers array (replace undefined/null with 0)
      const cleanedAnswers = Array(activeQuizzes[roomId]?.length || demoQuestions.length).fill(0);
      if (Array.isArray(userResults.answers)) {
        userResults.answers.forEach((ans, idx) => {
          if (ans !== null && ans !== undefined && ans !== -1) {
            cleanedAnswers[idx] = ans;
          }
        });
      }
      
      finalResults[participant.id] = {
        id: participant.id,
        username: participant.username,
        score: userResults.score || 0,
        answers: cleanedAnswers,
        totalQuestions: activeQuizzes[roomId]?.length || demoQuestions.length
      };
    });
    
    // Calculate rankings
    const sortedParticipants = Object.values(finalResults).sort((a, b) => b.score - a.score);
    
    // Assign ranks and determine winners
    sortedParticipants.forEach((participant, index) => {
      const rank = index + 1;
      finalResults[participant.id].rank = rank;
      finalResults[participant.id].isWinner = rank === 1;
    });
    
    // Update room status to FINISHED
    updateRoomStatus(roomId, "FINISHED").then(() => {
      // Store final results in database after room status is updated
      storeQuizResults(roomId, finalResults).catch(error => {
        console.error("Failed to store results, but continuing with game end:", error);
      });
    }).catch(error => {
      console.error("Failed to update room status, but continuing with game end:", error);
      // Try to store results anyway
      storeQuizResults(roomId, finalResults).catch(resultError => {
        console.error("Also failed to store results:", resultError);
      });
    });
    
    // Send final results to all clients in the room
    io.in(roomId).emit("quizResults", {
      participants: sortedParticipants,
      winners: sortedParticipants.filter(p => p.rank === 1)
    });
    
    // Clean up room resources
    delete roomTimers[roomId];
    
    console.log(`Quiz ended for room ${roomId} with ${sortedParticipants.length} participants`);
  } else {
    // Move to the next question after a delay
    setTimeout(() => {
      startQuestionTimer(roomId);
    }, 3000); // 3 second delay between questions
  }
}

// Function to update room status in database
async function updateRoomStatus(roomId: string, status: string) {
  try {
    console.log(`update ${roomId} ${status}`);
    
    // Update local room status
    if (rooms[roomId]) {
      rooms[roomId].status = status;
    }
    
    // Try PUT method first
    try {
      const response = await axios.put(
        `http://localhost:3000/api/room/${roomId}/status`,
        {
          status
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data;
    } catch (putError) {
      if (axios.isAxiosError(putError) && putError.response?.status === 405) {
        // If PUT fails with 405, try POST as fallback
        console.log(`PUT method not allowed for status update, trying POST...`);
        
        try {
          const response = await axios.post(
            `http://localhost:3000/api/room/${roomId}/status`,
            {
              status
            },
            {
              headers: {
                'Content-Type': 'application/json'
              }
            }
          );
          
          return response.data;
        } catch (postError) {
          console.error("Error updating room status with POST:", postError);
          
          // Log more detailed error information
          if (axios.isAxiosError(postError)) {
            console.error('POST Error Details:', {
              message: postError.message,
              status: postError.response?.status,
              data: postError.response?.data
            });
          }
          
          // Return a resolved promise with error info so we don't break the chain
          return {
            error: true,
            message: "Failed to update room status in database, but updated locally"
          };
        }
      } else {
        console.error("Error updating room status with PUT:", putError);
        
        // Log more detailed error information
        if (axios.isAxiosError(putError)) {
          console.error('PUT Error Details:', {
            message: putError.message,
            status: putError.response?.status,
            data: putError.response?.data
          });
        }
        
        // Return a resolved promise with error info so we don't break the chain
        return {
          error: true,
          message: "Failed to update room status in database, but updated locally"
        };
      }
    }
  } catch (error) {
    console.error("Error in updateRoomStatus function:", error);
    
    // Return a resolved promise with error info so we don't break the chain
    return {
      error: true,
      message: "Failed to update room status in database, but updated locally"
    };
  }
}

// Function to store quiz questions in database
async function storeQuizQuestions(roomId: string, questions: any[]) {
  console.log('Storing questions for room:', roomId);
  
  try {
    // Create a copy of the questions with correct answers for storage
    const questionsWithAnswers = questions.map((q) => ({
      id: q.id,
      questionText: q.questionText,
      options: q.options,
      correctOption: q.correctOption,
      timeLimit: q.timeLimit || 30
    }));
    
    console.log(`Sending ${questionsWithAnswers.length} questions to database for room ${roomId}`);
    
    const response = await axios.post(`http://localhost:3000/api/room/${roomId}/questions`, {
      questions: questionsWithAnswers
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Log success details
    console.log(`Questions stored successfully for room ${roomId}:`, {
      status: response.status,
      storedCount: response.data.questionsStored
    });

    return response.data;
  } catch (error) {
    // More detailed error logging
    console.error(`Failed to store questions for room ${roomId}`);
    
    if (axios.isAxiosError(error)) {
      console.error('API Error Details:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      // If the room doesn't exist in the database, we should handle it gracefully
      if (error.response?.status === 404) {
        console.log(`Room ${roomId} not found in database, only using in-memory questions`);
        return { questionsStored: 0, local: true };
      }
    } else {
      console.error('Unexpected Error:', error);
    }

    // Return a partial success to allow the game to continue with in-memory questions
    return { questionsStored: 0, error: true, message: "Failed to store questions in database" };
  }
}

// Function to store question answers in database
async function storeQuestionAnswers(roomId: string, questionIndex: number, selectedOption: number, userId: string, isCorrect: boolean) {
  try {
    // Check if the room still exists and is not already finished
    const room = rooms[roomId];
    if (!room || room.status === "FINISHED") {
      console.log(`Room ${roomId} is already finished or doesn't exist, skipping answer storage`);
      return null; // Skip storing answers for finished games
    }

    // Get the participant using user ID instead of socket ID
    const participant = room?.participants.find(p => p.id === userId);
    if (!participant) {
      console.error("Participant not found for user ID:", userId);
      return null;
    }

    // Get the current question
    const currentQuestion = activeQuizzes[roomId]?.[questionIndex] || demoQuestions[questionIndex];
    if (!currentQuestion) {
      console.error(`Question not found for index: ${questionIndex}`);
      return null;
    }

    // Fixed 10 points for correct answers, 0 for incorrect
    const pointsEarned = isCorrect ? 10 : 0;
    
    // Make sure the selected option is a valid number (not -1 or null)
    const validSelectedOption = selectedOption >= 0 ? selectedOption : 0;
    
    // Format the answer data as expected by the API
    const answerData = [{
      participantId: userId,
      selectedOption: validSelectedOption,
      isCorrect: isCorrect,
      answerTime: new Date(),
      pointsEarned: pointsEarned,
      correctOption: currentQuestion.correctOption // Add the correct option for reference
    }];

    // Log the answers being sent
    console.log(`Storing answer for room ${roomId}, question ${questionIndex}, user ${userId}:`, answerData);

    try {
      // First check if questions exist for this room
      let questionsExist = false;
      try {
        const questionsResponse = await axios.get(`http://localhost:3000/api/room/${roomId}/questions`);
        const existingQuestions = questionsResponse.data.questions;
        questionsExist = existingQuestions && existingQuestions.length > questionIndex;
        
        if (!questionsExist) {
          // If questions don't exist or there aren't enough, store them now
          await storeQuizQuestions(roomId, activeQuizzes[roomId] || demoQuestions);
        }
      } catch (error) {
        // If checking fails, try to store questions again
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          await storeQuizQuestions(roomId, activeQuizzes[roomId] || demoQuestions);
        }
      }
      
      // Now try to store the answer
      try {
        // Convert answerTime to seconds for Prisma schema compatibility
        const answerWithSeconds = answerData.map(answer => ({
          ...answer,
          answerTime: Math.floor(new Date().getTime() / 1000) // Convert to seconds
        }));
        
        const response = await axios.post(`http://localhost:3000/api/room/${roomId}/answers`, {
          questionIndex,
          answers: answerWithSeconds
        });
        
        console.log(`Answer stored for user ${userId}:`, {
          questionIndex,
          selectedOption: validSelectedOption,
          isCorrect,
          pointsEarned
        });
        
        return response.data;
      } catch (error) {
        console.error("Error storing question answers:", error);
        
        if (axios.isAxiosError(error)) {
          console.error('API Error Details:', {
            status: error.response?.status,
            data: error.response?.data
          });
        }
        
        // Continue with the game even if storing answers fails
        return {
          stored: false,
          error: true,
          message: "Failed to store answer in database, but game will continue"
        };
      }
    } catch (error) {
      // Don't let API errors stop game progression
      console.error("Error in answer storage process:", error);
      return {
        stored: false,
        error: true,
        message: "Error in answer storage process, but game will continue"
      };
    }
  } catch (error) {
    console.error("Error in storeQuestionAnswers function:", error);
    return null; // Don't let this error propagate and stop the game
  }
}

// Function to store quiz results in database
async function storeQuizResults(roomId: string, results: any) {
  try {
    // Clean and format results for API
    const formattedResults = Object.entries(results).map(([userId, userData]: [string, any]) => {
      // Make sure answers are simple arrays with no -1 or null values
      const cleanAnswers = Array.isArray(userData.answers) 
        ? userData.answers.map((ans: any) => ans === null || ans === -1 ? 0 : ans)
        : [];
      
      return {
        participantId: userId,
        score: userData.score || 0,
        answers: cleanAnswers,
        rank: userData.rank || 0,
        isWinner: userData.isWinner || false
      };
    });

    // Log the results being sent
    console.log(`Storing quiz results for room ${roomId} with ${formattedResults.length} participants`);
    console.log("First participant data sample:", JSON.stringify(formattedResults[0]).substring(0, 100));

    // Convert results into a simpler format that's easier to parse
    const simplifiedData = {
      roomId: roomId,
      completedAt: new Date().toISOString(),
      participants: formattedResults.map(p => ({
        id: p.participantId,
        score: p.score,
        isWinner: p.isWinner
      }))
    };

    try {
      // Try with dynamic timeout and retry logic
      const maxRetries = 3;
      let retryCount = 0;
      let lastError = null;

      while (retryCount < maxRetries) {
        try {
          // Store results in database with increased timeout
          const response = await axios.post(
            `http://localhost:3000/api/room/${roomId}/results`,
            simplifiedData,
            {
              headers: {
                'Content-Type': 'application/json'
              },
              timeout: 10000 // 10 second timeout
            }
          );

          console.log(`Quiz results stored for room ${roomId}:`, {
            status: response.status,
            participantCount: formattedResults.length
          });

          return response.data;
        } catch (error) {
          lastError = error;
          retryCount++;
          console.log(`Attempt ${retryCount} failed, ${maxRetries - retryCount} retries left`);
          
          // Store in a local file as a fallback
          if (retryCount === maxRetries) {
            try {
              // Continue with the next step even if saving to database failed
              console.log("Saving results only locally due to API errors");
              return {
                stored: "locally",
                roomId,
                participants: formattedResults.length,
                timestamp: new Date().toISOString()
              };
            } catch (fallbackError) {
              console.error("Even fallback storage failed:", fallbackError);
            }
          }
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // If we're here, all retries failed
      throw lastError;
    } catch (error) {
      console.error("Error storing quiz results after retries:", error);
      
      if (axios.isAxiosError(error)) {
        console.error('API Error Details:', {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data
        });
      }
      
      // Return a partial success to allow the game to continue
      return { resultsStored: 0, error: true, message: "Failed to store results in database, but game will continue" };
    }
  } catch (error) {
    console.error("Error in storeQuizResults function:", error);
    return { resultsStored: 0, error: true, message: "Error in results storage process" };
  }
}

// Function to check if the necessary API routes exist and handle the fallback
async function ensureApiRoutesExist(roomId: string) {
  try {
    console.log(`Checking API endpoints for room ${roomId}`);
    
    // Check if the room exists in the database
    try {
      const roomResponse = await axios.get(`http://localhost:3000/api/room/${roomId}`);
      console.log(`Room ${roomId} exists in database`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.log(`Room ${roomId} not found in database, creating it`);
        // Try to create the room if it doesn't exist
        if (rooms[roomId]) {
          try {
            await createRoomData(roomId, {
              playerCount: rooms[roomId].maxParticipants,
              user: rooms[roomId].participants[0]?.id || 'anonymous',
              topic: rooms[roomId].topic || 'General Knowledge',
              roomTimeLimit: rooms[roomId].roomTimeLimit || 60,
              questionCount: rooms[roomId].questionCount || 5,
              difficulty: rooms[roomId].difficulty || 'MEDIUM'
            });
            console.log(`Created room ${roomId} in database`);
          } catch (createError) {
            console.error(`Failed to create room ${roomId} in database:`, createError);
          }
        }
      }
    }
    
    // Check if questions exist for this room
    try {
      const questionsResponse = await axios.get(`http://localhost:3000/api/room/${roomId}/questions`);
      const existingQuestions = questionsResponse.data.questions;
      
      if (!existingQuestions || existingQuestions.length === 0) {
        console.log(`No questions found for room ${roomId}, storing them`);
        await storeQuizQuestions(roomId, activeQuizzes[roomId] || demoQuestions);
      } else {
        console.log(`Found ${existingQuestions.length} questions for room ${roomId}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.log(`Question endpoint not found for room ${roomId}, storing questions`);
        await storeQuizQuestions(roomId, activeQuizzes[roomId] || demoQuestions);
      } else {
        console.error(`Error checking questions for room ${roomId}:`, error);
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Failed to ensure API routes for room ${roomId}:`, error);
    return false;
  }
}

server.listen(PORT, () => {
  console.log(`Server is listening at http://localhost:${PORT}`);
});

function generateRandomId(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}