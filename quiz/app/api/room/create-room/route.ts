import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log(body);
    
    if (!body || !body.roomId || !body.roomData) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { roomId, roomData } = body;
    const { playerCount, user, topic, roomTimeLimit, questionCount, difficulty } = roomData;

    // Check if the user exists
    const hostUser = await prisma.user.findUnique({
      where: { id: user },
    });
    
    if (!hostUser) {
      return NextResponse.json(
        { error: "Host user not found" },
        { status: 404 }
      );
    }

    // Create the room in the database
    const room = await prisma.room.create({
      data: {
        id: roomId,
        status: "WAITING",
        maxParticipants: Number(playerCount),
        roomTimeLimit: Number(roomTimeLimit),
        questionCount: Number(questionCount),
        difficulty: difficulty.toUpperCase() as "EASY" | "MEDIUM" | "HARD" | "EXPERT",
        quizTopic: topic,
        duration: 0,
        hostId: user,
        participants: {
          create: [{
            userId: user,
          }]
        }
      },
    });

    return NextResponse.json({ message: "Room created successfully", room });
  } catch (error: unknown) {
    console.error("Error creating room:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: "Error creating room", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
