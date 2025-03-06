import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = await params;

    console.log(`Fetching game history for user: ${userId}`);

    // Check if user exists
    const userExists = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!userExists) {
      console.log(`User ${userId} not found`);
      return NextResponse.json({ games: [] });
    }

    // Get all rooms where the user has participated
    const rooms = await prisma.room.findMany({
      where: {
        status: "FINISHED",
        OR: [
          { participants: { some: { userId } } },
          { hostId: userId }
        ]
      },
      include: {
        host: {
          select: {
            id: true,
            name: true
          }
        },
        participants: {
          select: {
            userId: true,
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
        updatedAt: 'desc'
      },
      take: 10
    });

    console.log(`Found ${rooms.length} completed games for user ${userId}`);

    // For each room, get all participant answers
    const games = await Promise.all(rooms.map(async (room) => {
      // Get opponent information
      const opponents = room.participants.filter(p => p.userId !== userId);
      const opponent = opponents.length > 0 ? opponents[0] : null;
      
      // Get user answers for this room
      const userAnswers = await prisma.participantAnswer.findMany({
        where: {
          participantId: userId,
          question: {
            gameSessionId: room.id
          }
        }
      });
      
      // Calculate user score
      const userScore = userAnswers.reduce((total, answer) => 
        total + (answer.isCorrect ? answer.pointsEarned : 0), 0);
      
      // Get opponent answers if applicable
      let opponentScore = 0;
      if (opponent) {
        const opponentAnswers = await prisma.participantAnswer.findMany({
          where: {
            participantId: opponent.userId,
            question: {
              gameSessionId: room.id
            }
          }
        });
        
        opponentScore = opponentAnswers.reduce((total, answer) => 
          total + (answer.isCorrect ? answer.pointsEarned : 0), 0);
      } else {
        // Estimate if no opponent
        opponentScore = Math.floor(userScore * 0.8);
      }
      
      // Determine game result
      let result: "win" | "loss" | "tie" = "tie";
      if (userScore > opponentScore) {
        result = "win";
      } else if (userScore < opponentScore) {
        result = "loss";
      }

      return {
        id: room.id,
        topic: room.QuizCategory?.name || room.quizTopic || "General Knowledge",
        date: room.updatedAt.toISOString(),
        opponent: opponent?.user?.name || "Solo Game",
        result,
        score: `${userScore} points`,
        opponentScore: `${opponentScore} points`
      };
    }));

    return NextResponse.json({ games });
  } catch (error) {
    console.error("Error fetching game history:", error);
    return NextResponse.json({ games: [] });
  }
} 