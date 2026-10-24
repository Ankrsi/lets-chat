import { t } from "../../i18n";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";

const helloWrld = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Hello world", t("SUCCESS", req.language || "en") as string));
});

export { helloWrld };
