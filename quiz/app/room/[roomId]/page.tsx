"use client";
import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useSocketStore } from "@/store/socketStore";
import axios from "axios";
import WaitingCard from "@/app/components/ui/WaitingCard";

interface RoomDetails {
  id: string;
  topic: string;
  time: number;
  currentParticipants: number;
  maxParticipants: number;
  participants: Array<{
    id: string;
    username: string;
  }>;
}

const Page = () => {
  const params = useParams();
  const roomId = params?.roomId as string;
  const [roomDetails, setRoomDetails] = useState<RoomDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket } = useSocketStore();

  const fetchRoomDetails = async () => {
    if (!roomId) {
      setError("No room ID found");
      setIsLoading(false);
      return;
    }

    try {
      const response = await axios.get(`/api/room/${roomId}`);
      setRoomDetails(response.data);
      console.log(response.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred"
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRoomDetails();

    if (!socket) {
      // console.error("Socket not initialized");
      return;
    }

    // Listen for room updates
    socket.on("updatePlayers", (updatedRoom: RoomDetails) => {
      console.log("Received room update:", updatedRoom);
      setRoomDetails(updatedRoom);
    });

    // Listen for room errors
    socket.on("roomError", (errorMessage: string) => {
      setError(errorMessage);
    });

    return () => {
      socket.off("updatePlayers");
      socket.off("roomError");
    };
  }, [roomId, socket]);

  if (isLoading) {
    return (
      <div className="h-screen bg-main text-white flex items-center justify-center">
        Loading room details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-main text-white flex items-center justify-center">
        {error}
      </div>
    );
  }

  if (!roomDetails) {
    return (
      <div className="h-screen bg-main text-white flex items-center justify-center">
        No room details available
      </div>
    );
  }

  return (
    <div className="h-screen bg-main text-white flex items-center justify-center">
      <WaitingCard
        roomId={roomDetails.id}
        currentPlayers={roomDetails.currentParticipants}
        maxPlayers={roomDetails.maxParticipants}
        participants={roomDetails.participants}
      />
    </div>
  );
};

export default Page;
