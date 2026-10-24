import axios from "axios";
import jwt from "jsonwebtoken";
import { ApiError } from "../../utils/apiError";

export async function getAuth(idToken: string): Promise<any> {
  try {
    // const response = await axios.get(
    //   `${process.env.AUTH_SERVICE_BASE_URL}/api/v1/auth/verify-user`,
    //   {
    //     headers: {
    //       Authorization: `Bearer ${idToken}`,
    //       "x-internal-api-key": process.env.INTERNAL_API_KEY,
    //     },
    //   },
    // );

    // return response.data.data?.user;

    const response = jwt.verify(idToken, process.env.JWT_PUBLIC_KEY!.replace(/\\n/g, '\n'), {
      algorithms: ["RS256"],
      issuer: "auth.superapp"
    });

    return response;

  } catch (err: any) {
    console.error("Failed to fetch user from token", err?.response?.data || err.message);
  }
}



// This is for wallet transaction
interface GetUserByIdPayload {
  user_id: string;
}

export const getUserById = async ({ user_id }: GetUserByIdPayload) => {
  try {

    // Use GET if your auth service supports it, otherwise use POST with an empty body
    const response = await axios.get(`${process.env.AUTH_SERVICE_BASE_URL}/api/v1/auth/user/${user_id}`, {
      headers: {
        "x-internal-api-key": process.env.INTERNAL_API_KEY,
      },
    });

    const user = response.data?.data?.user || response.data?.data;
    if (!user?._id) {
      throw new ApiError("User ID not returned from auth service", 500);
    }

    return {
      user,
    };
  } catch (error: any) {
    const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";
    const status = error?.response?.status || 500;

    console.error("Auth Service Error:", errorMessage);

    throw new ApiError(errorMessage, status);
  }
};
