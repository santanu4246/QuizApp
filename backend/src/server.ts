import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { PORT } from "./config";
import { createRoomData, joinRoom } from "./utils";

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
  participants: Array<{
    id: string;
    username: string;
  }>;
}

const rooms: Record<string, EnhancedRoomData> = {};

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  socket.emit("initial___SOCKET___Connection", socket.id);

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
    } else {
      socket.emit("roomError", "Room not found");
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
        } else {
          io.in(roomId).emit("updatePlayers", room);
        }
      }
    });
  });
});

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