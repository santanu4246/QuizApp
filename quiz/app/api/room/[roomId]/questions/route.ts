import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const { roomId } = params;
    const body = await req.json();
    const { questions } = body;

    if (!roomId || !questions || !Array.isArray(questions)) {
      return NextResponse.json(
        { error: "Room ID and questions array are required" },
        { status: 400 }
      );
    }

    // Get the room to check if it exists
    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      return NextResponse.json(
        { error: "Room not found" },
        { status: 404 }
      );
    }

    // Get or create a default quiz category
    let category = await prisma.quizCategory.findFirst({
      where: { name: room.quizTopic || "General Knowledge" },
    });

    if (!category) {
      category = await prisma.quizCategory.create({
        data: {
          name: room.quizTopic || "General Knowledge",
          description: `Questions about ${room.quizTopic || "General Knowledge"}`,
          isActive: true,
        },
      });
    }

    // Store each question in the database
    const storedQuestions = [];
    for (const q of questions) {
      // Check if question already exists
      let question = await prisma.question.findFirst({
        where: {
          questionText: q.questionText,
          categoryId: category.id,
        },
      });

      if (!question) {
        // Create the question if it doesn't exist
        question = await prisma.question.create({
          data: {
            questionText: q.questionText,
            options: q.options,
            correctOption: q.correctOption,
            difficulty: room.difficulty,
            points: 10,
            categoryId: category.id,
          },
        });
      }

      // Create game question
      const gameQuestion: { id: string } = await prisma.gameQuestion.create({
        data: {
          gameSessionId: roomId, // Using roomId as gameSessionId
          questionId: question.id,
          orderIndex: storedQuestions.length,
          timeLimit: q.timeLimit,
          points: 10,
        },
      });

      storedQuestions.push(gameQuestion);
    }

    // Update room with quiz category
    await prisma.room.update({
      where: { id: roomId },
      data: {
        quizCategoryId: category.id,
      },
    });

    return NextResponse.json({
      message: "Questions stored successfully",
      questions: storedQuestions,
    });
  } catch (error) {
    console.error("Error storing questions:", error);
    return NextResponse.json(
      { error: "Failed to store questions" },
      { status: 500 }
    );
  }
} 