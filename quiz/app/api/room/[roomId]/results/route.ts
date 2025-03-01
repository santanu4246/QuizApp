import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const { roomId } = params;
    const body = await req.json();
    const { results } = body;

    if (!roomId || !results || !results.participants) {
      return NextResponse.json(
        { error: "Room ID and results data are required" },
        { status: 400 }
      );
    }

    // Get the room
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: true,
      },
    });

    if (!room) {
      return NextResponse.json(
        { error: "Room not found" },
        { status: 404 }
      );
    }

    // Update user statistics for each participant
    for (const participant of results.participants) {
      const user = await prisma.user.findUnique({
        where: { id: participant.id },
      });

      if (user) {
        // Find the highest score to determine winner
        const highestScore = Math.max(...results.participants.map((p: any) => p.score));
        const isWinner = participant.score === highestScore && participant.score > 0;
        const isDraw = results.participants.filter((p: any) => p.score === highestScore).length > 1;

        // Update user statistics
        await prisma.user.update({
          where: { id: participant.id },
          data: {
            gamesPlayed: { increment: 1 },
            wins: isWinner && !isDraw ? { increment: 1 } : undefined,
            draws: isDraw ? { increment: 1 } : undefined,
            losses: !isWinner && !isDraw ? { increment: 1 } : undefined,
            totalPoints: { increment: participant.score },
            // Recalculate win rate
            winRate: {
              set: (user.wins + (isWinner && !isDraw ? 1 : 0)) / (user.gamesPlayed + 1),
            },
          },
        });

        // Update user quiz category statistics if applicable
        if (room.quizCategoryId) {
          const userCategory = await prisma.userQuizCategory.findUnique({
            where: {
              userId_categoryId: {
                userId: participant.id,
                categoryId: room.quizCategoryId,
              },
            },
          });

          if (userCategory) {
            // Update existing user category stats
            const newPlayCount = userCategory.playCount + 1;
            const newAvgScore = (userCategory.avgScore * userCategory.playCount + participant.score) / newPlayCount;

            await prisma.userQuizCategory.update({
              where: {
                id: userCategory.id,
              },
              data: {
                playCount: newPlayCount,
                avgScore: newAvgScore,
              },
            });
          } else {
            // Create new user category stats
            await prisma.userQuizCategory.create({
              data: {
                userId: participant.id,
                categoryId: room.quizCategoryId,
                playCount: 1,
                avgScore: participant.score,
              },
            });
          }
        }
      }
    }

    return NextResponse.json({
      message: "Quiz results processed successfully",
    });
  } catch (error) {
    console.error("Error processing quiz results:", error);
    return NextResponse.json(
      { error: "Failed to process quiz results" },
      { status: 500 }
    );
  }
} 