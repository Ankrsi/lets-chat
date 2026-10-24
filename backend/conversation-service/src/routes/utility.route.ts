import { Router } from "express";
import {
  deleteUsersDetails,
  getUsersDetails,
  setUsersDetails,
} from "../controllers/utility/UsersUtility.controller";
import {
  getPackageDetails,
  setPackageDetails,
} from "../controllers/utility/PackageUtility.controller";
import {
  getServiceDetails,
  setServiceDetails,
} from "../controllers/utility/ServiceUtility.controller";

const router = Router();
router.get("/users-details/:user_id", getUsersDetails);
router.post("/users-details", setUsersDetails);
router.post("/delete-users-details", deleteUsersDetails);
router.get("/package-details/:package_id", getPackageDetails);
router.post("/package-details", setPackageDetails);
router.get("/service-details/:service_id", getServiceDetails);
router.post("/service-details", setServiceDetails);
export default router;
