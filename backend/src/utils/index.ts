import { RoomType } from "../types/types";
import axios from "axios";

export async function createRoomData(roomId: string, roomData: RoomType) {
  try {
    const response = await axios.post(
      "http://localhost:3000/api/room/create-room",
      {
        roomId,
        roomData,
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.details || error.message);
    }
    throw error;
  }
}
export async function joinRoom(roomId: string, user: string) {
  try {
    const response = await axios.post(
      "http://localhost:3000/api/room/join-room",
      {
        roomId,
        user,
      }
    );
    console.log(response.data);
  } catch (error) {
    console.log(error);
  }
}
