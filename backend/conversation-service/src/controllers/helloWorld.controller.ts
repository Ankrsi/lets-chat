import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";

const helloWrld = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Hello world", "success"));
});

export { helloWrld };
