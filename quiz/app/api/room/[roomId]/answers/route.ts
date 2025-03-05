import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const { roomId } = await params;
    const body = await req.json();
    const { questionIndex, answers } = body;
    console.log("answers", roomId, questionIndex, answers);

    if (!roomId || questionIndex === undefined || !answers || !Array.isArray(answers)) {
      return NextResponse.json(
        { error: "Room ID, question index, and answers array are required" },
        { status: 400 }
      );
    }

    // Get the game question for this room and index
    const gameQuestions = await prisma.gameQuestion.findMany({
      where: { gameSessionId: roomId },
      orderBy: { orderIndex: 'asc' },
    });

    if (!gameQuestions || gameQuestions.length <= questionIndex) {
      return NextResponse.json(
        { error: "Game question not found" },
        { status: 404 }
      );
    }

    const gameQuestion = gameQuestions[questionIndex];

    // Store each participant's answer
    const storedAnswers = [];
    for (const answer of answers) {
      // Check if answer already exists
      const existingAnswer = await prisma.participantAnswer.findUnique({
        where: {
          participantId_questionId: {
            participantId: answer.participantId,
            questionId: gameQuestion.id,
          },
        },
      });

      if (existingAnswer) {
        // Update existing answer
        const updatedAnswer = await prisma.participantAnswer.update({
          where: {
            id: existingAnswer.id,
          },
          data: {
            selectedOption: answer.selectedOption,
            isCorrect: answer.isCorrect,
            answerTime: answer.answerTime,
            pointsEarned: answer.pointsEarned,
          },
        });
        storedAnswers.push(updatedAnswer);
      } else {
        // Create new answer
        const newAnswer = await prisma.participantAnswer.create({
          data: {
            participantId: answer.participantId,
            questionId: gameQuestion.id,
            selectedOption: answer.selectedOption,
            isCorrect: answer.isCorrect,
            answerTime: answer.answerTime,
            pointsEarned: answer.pointsEarned,
          },
        });
        storedAnswers.push(newAnswer);
      }
    }

    return NextResponse.json({
      message: "Answers stored successfully",
      answers: storedAnswers,
    });
  } catch (error) {
    console.error("Error storing answers:", error);
    return NextResponse.json(
      { error: "Failed to store answers" },
      { status: 500 }
    );
  }
} 