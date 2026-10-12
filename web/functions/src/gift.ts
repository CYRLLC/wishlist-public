import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'

if (!getApps().length) initializeApp()
const db = getFirestore()
const options = { region: 'asia-east1', maxInstances: 3 }
const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000
const identifier = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new HttpsError('invalid-argument', '無效的識別碼')
  }
  return value
}

async function requireMember(tx: FirebaseFirestore.Transaction, coupleId: unknown, uid: string) {
  const couple = await tx.get(db.doc(`couples/${identifier(coupleId)}`))
  const members = couple.data()?.members
  if (!Array.isArray(members) || members.length !== 2 || !members.includes(uid)) {
    throw new HttpsError('permission-denied', '不是此配對的成員')
  }
}

// Either partner may redeem (the holder taps the NFC tag, or the issuer scans the card's QR).
// The request id is chosen by the client so a double tap or a retried network call is counted once.
export const redeemGiftCoupon = onCall(options, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '請先登入')
  const uid = req.auth.uid
  const couponId = identifier(req.data?.couponId)
  const requestId = identifier(req.data?.requestId)
  const note = typeof req.data?.note === 'string' ? req.data.note.trim().slice(0, 100) : ''
  const couponRef = db.doc(`gift_coupons/${couponId}`)
  const redemptionRef = db.doc(`gift_redemptions/${requestId}`)
  return db.runTransaction(async (tx) => {
    const [coupon, existing] = await Promise.all([tx.get(couponRef), tx.get(redemptionRef)])
    const value = coupon.data()
    if (!value) throw new HttpsError('not-found', '找不到這張禮物券')
    await requireMember(tx, value.coupleId, uid)
    if (existing.exists) {
      if (existing.data()?.couponId !== couponId) throw new HttpsError('already-exists', '請重新操作')
      return { remainingUses: value.remainingUses, duplicate: true }
    }
    const now = Date.now()
    if (now < value.startsAt) throw new HttpsError('failed-precondition', '禮物券還沒開始使用')
    if (now > value.expiresAt) throw new HttpsError('failed-precondition', '禮物券已過期')
    if (!Number.isSafeInteger(value.remainingUses) || value.remainingUses <= 0) {
      throw new HttpsError('failed-precondition', '次數已經用完了')
    }
    const remainingUses = value.remainingUses - 1
    tx.update(couponRef, { remainingUses, updatedAt: now })
    tx.create(redemptionRef, {
      id: requestId, couponId, coupleId: value.coupleId, holderId: value.holderId, redeemedBy: uid,
      note, remainingAfter: remainingUses, undone: false, createdAt: now,
    })
    return { remainingUses, duplicate: false }
  })
})

export const undoGiftRedemption = onCall(options, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '請先登入')
  const uid = req.auth.uid
  const redemptionRef = db.doc(`gift_redemptions/${identifier(req.data?.id)}`)
  return db.runTransaction(async (tx) => {
    const redemption = await tx.get(redemptionRef)
    const value = redemption.data()
    if (!value) throw new HttpsError('not-found', '找不到這筆兌換紀錄')
    const couponRef = db.doc(`gift_coupons/${identifier(value.couponId)}`)
    const coupon = await tx.get(couponRef)
    await requireMember(tx, value.coupleId, uid)
    if (value.undone) throw new HttpsError('failed-precondition', '這筆已經復原過了')
    if (Date.now() - value.createdAt > UNDO_WINDOW_MS) throw new HttpsError('failed-precondition', '超過 24 小時，無法復原')
    const data = coupon.data()
    if (!data || data.coupleId !== value.coupleId) throw new HttpsError('failed-precondition', '禮物券資料不一致')
    const remainingUses = Math.min(data.totalUses, data.remainingUses + 1)
    tx.update(couponRef, { remainingUses, updatedAt: Date.now() })
    tx.update(redemptionRef, { undone: true, undoneBy: uid, undoneAt: Date.now() })
    return { remainingUses }
  })
})
