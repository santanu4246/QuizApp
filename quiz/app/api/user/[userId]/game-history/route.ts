import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;

    // Get the user's game history from completed rooms
    const rooms = await prisma.room.findMany({
      where: {
        status: "FINISHED",
        participants: {
          some: {
            userId: userId
          }
        }
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        QuizCategory: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        endTime: 'desc'
      },
      take: 10 // Limit to last 10 games
    });

    // Transform the data to match the frontend's expected format
    const games = rooms.map(room => {
      const userParticipant = room.participants.find(p => p.userId === userId);
      const otherParticipant = room.participants.find(p => p.userId !== userId);
      
      // Calculate result based on scores (this logic should match your game rules)
      let result: "win" | "loss" | "tie" = "tie";
      if (userParticipant && otherParticipant) {
        // This is a placeholder - you should use your actual score comparison logic
        const userScore = Math.random() * 10; // Replace with actual score
        const opponentScore = Math.random() * 10; // Replace with actual score
        
        if (userScore > opponentScore) result = "win";
        else if (userScore < opponentScore) result = "loss";
      }

      return {
        id: room.id,
        topic: room.QuizCategory?.name || room.quizTopic || "General",
        date: room.endTime?.toISOString() || room.updatedAt.toISOString(),
        opponent: otherParticipant?.user.name || "Unknown",
        result,
        score: "8/10", // Replace with actual score
        opponentScore: "6/10" // Replace with actual score
      };
    });

    return NextResponse.json({ games });
  } catch (error) {
    console.error("Error fetching game history:", error);
    return NextResponse.json(
      { error: "Failed to fetch game history" },
      { status: 500 }
    );
  }
} 