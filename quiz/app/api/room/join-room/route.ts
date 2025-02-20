import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    // Parse and log the request body for debugging purposes
    const body = await req.json();
    console.log("Join room request body:", body);

    // Destructure the received data
    const { roomId, user } = body;

    // 1. Verify that the user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: user },
    });
    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 2. Find the room by its ID, including its current participants
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { participants: true },
    });
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // 3. Check if the room is full
    if (room.participants.length >= room.maxParticipants) {
      return NextResponse.json({ error: "Room is full" }, { status: 400 });
    }

    // 4. Check if the user is already a participant in the room
    const alreadyJoined = room.participants.some(
      (participant) => participant.userId === user
    );
    if (alreadyJoined) {
      return NextResponse.json(
        { error: "User already joined the room" },
        { status: 400 }
      );
    }

    const updatedRoom = await prisma.room.update({
      where: { id: roomId },
      data: {
        participants: {
          create: {
            user: { connect: { id: user } },
          },
        },
      },
    });

    return NextResponse.json({
      message: "Joined room successfully",
      updatedRoom,
    });
  } catch (error: unknown) {
    // Safely extract an error message from the caught error.
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? (error as { message: string }).message
        : "Unknown error";

    console.error("Error joining room:", errorMessage);

    return NextResponse.json(
      { error: "Error joining room", details: errorMessage },
      { status: 500 }
    );
  }
}
