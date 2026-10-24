import { Router } from 'express'
import { acidResult } from '../controllers/webhooks/acidResult.controller'
import { verifyInternalRequest } from '../middlewares/internal-auth.middleware'
import { validateFailedResult } from '../controllers/webhooks/validateFailedResult'
import { createdTxn } from '../controllers/webhooks/createdTxn.controller'
import { createGroupPayment } from '../controllers/groupPayment/createGroupPayment.controller'
import { verifyUser } from '../middlewares/verifyUser'
import { updatePaymentGroup } from '../controllers/groupPayment/updatePaymentGroup'
import { getCreatedPaymentGroup } from '../controllers/groupPayment/createdPaymentGroup.controller'
import { notifyFcmToUser } from '../controllers/fcm/notifyFcm.controller'
import { notifyPlamToUser } from '../controllers/plam/notifyPlam.controller'
import { notifyQrExpired } from '../controllers/transactionQr/notifyQr.controller'
import { notifyDriverPayment } from '../controllers/wallet/notifyDriver.controller'
import { notifyTaxiSubscribeTxn } from '../controllers/wallet/notifyUserTaxiSubscribTxn.controller'

const router = Router()

router.post('/validate-acid-completed', verifyInternalRequest, acidResult)
router.post('/validate-failed', verifyInternalRequest, validateFailedResult)
router.post('/created-txn', verifyInternalRequest, createdTxn)


// GROUP PAYMENT
router.post(
    "/create-group-payment",
    verifyUser,
    createGroupPayment
)


// UPDATE PAYMENT GROUP
router.patch(
    "/update-pymt-group",
    verifyInternalRequest,
    updatePaymentGroup
)


// GET CREATED PAYMENY GROUP
router.get(
    "/created-payment-group",
    verifyUser,
    getCreatedPaymentGroup
)

// notify fcm expired
router.post(
    "/fcm-expired",
    verifyInternalRequest,
    notifyFcmToUser
)

// notify plam register
router.post(
    "/plam-register-socket",
    verifyInternalRequest,
    notifyPlamToUser
)

// notify qr expired
router.post(
    "/qr-expired",
    verifyInternalRequest,
    notifyQrExpired
)


// Notify driver after Ods payment
router.post(
    '/notify-driver',
    verifyInternalRequest,
    notifyDriverPayment
)

// Notify user about taxi subscription txn status
router.post(
    '/notify-user-taxi-subs',
    verifyInternalRequest,
    notifyTaxiSubscribeTxn
)

export default router;



