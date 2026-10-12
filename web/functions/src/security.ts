import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { createHash, randomBytes } from 'node:crypto'
import { onCall, HttpsError } from 'firebase-functions/v2/https'

if (!getApps().length) initializeApp()
const db = getFirestore()
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const options = { region: 'asia-east1', maxInstances: 3 }
const identifier = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new HttpsError('invalid-argument', '無效的識別碼')
  }
  return value
}

export const createPairInvite = onCall(options, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '請先登入')
  const uid = req.auth.uid
  const token = randomBytes(24).toString('hex')
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000
  await db.runTransaction(async (tx) => {
    const profile = await tx.get(db.doc(`users/${uid}`))
    if (!profile.exists || profile.data()?.coupleId) {
      throw new HttpsError('failed-precondition', '已配對的帳號不能產生邀請')
    }
    // One invitation per account; regeneration immediately invalidates the old token.
    tx.set(db.doc(`pair_invites/${uid}`), { tokenHash: hash(token), expiresAt })
  })
  return { code: `${uid}.${token}`, expiresAt }
})

export const acceptPairInvite = onCall(options, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '請先登入')
  const uid = req.auth.uid
  const code = typeof req.data?.code === 'string' ? req.data.code : ''
  const [owner, token, extra] = code.split('.')
  identifier(owner)
  if (extra || !/^[a-f0-9]{48}$/.test(token || '') || owner === uid) {
    throw new HttpsError('invalid-argument', '請使用新的邀請碼，不能使用帳號 ID 配對')
  }
  const coupleRef = db.collection('couples').doc()
  await db.runTransaction(async (tx) => {
    const mine = db.doc(`users/${uid}`), partner = db.doc(`users/${owner}`)
    const inviteRef = db.doc(`pair_invites/${owner}`)
    const [me, other, invite] = await Promise.all([tx.get(mine), tx.get(partner), tx.get(inviteRef)])
    if (!me.exists || !other.exists || !invite.exists || invite.data()?.tokenHash !== hash(token)
        || invite.data()?.expiresAt <= Date.now()) {
      throw new HttpsError('permission-denied', '邀請不存在、已使用或已過期')
    }
    if (me.data()?.coupleId || other.data()?.coupleId) {
      throw new HttpsError('failed-precondition', '其中一方已配對，無法重新綁定')
    }
    tx.create(coupleRef, { id: coupleRef.id, members: [owner, uid], createdAt: Date.now() })
    tx.update(mine, { coupleId: coupleRef.id })
    tx.update(partner, { coupleId: coupleRef.id })
    tx.delete(inviteRef)
  })
  return { coupleId: coupleRef.id }
})

// Both awarding and spending points use persisted records, not caller-supplied amounts.
export const settlePoints = onCall(options, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '請先登入')
  const uid = req.auth.uid, itemId = identifier(req.data?.id)
  const action = req.data?.action
  if (action !== 'approveTask' && action !== 'redeemWish') throw new HttpsError('invalid-argument', '無效操作')
  const itemRef = db.doc(`${action === 'approveTask' ? 'tasks' : 'wishes'}/${itemId}`)
  await db.runTransaction(async (tx) => {
    const item = await tx.get(itemRef), value = item.data()
    if (!value) throw new HttpsError('not-found', '項目不存在')
    const couple = await tx.get(db.doc(`couples/${identifier(value.coupleId)}`))
    const members = couple.data()?.members
    if (!Array.isArray(members) || members.length !== 2 || !members.includes(uid)) {
      throw new HttpsError('permission-denied', '不是此配對的成員')
    }
    const target = action === 'approveTask' ? value.claimerId : value.authorId
    if (!members.includes(target)) throw new HttpsError('permission-denied', '點數對象不屬於此配對')
    if (action === 'approveTask') {
      const reviewer = value.selfReport ? value.creatorId !== uid && target !== uid : value.creatorId === uid && target !== uid
      if (!reviewer || value.status !== 'claimed') throw new HttpsError('failed-precondition', '無法確認此任務')
    } else if (target !== uid || value.status !== 'deferred') {
      throw new HttpsError('failed-precondition', '只能兌換自己的待兌換願望')
    }
    const amount = action === 'approveTask' ? value.points : -value.deferredPoints
    if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1000000) {
      throw new HttpsError('failed-precondition', '點數必須為有效正整數')
    }
    const profileRef = db.doc(`users/${identifier(target)}`)
    const profile = await tx.get(profileRef)
    if (!profile.exists || profile.data()?.coupleId !== value.coupleId) throw new HttpsError('permission-denied', '配對資料不一致')
    const history = await tx.get(db.collection('transactions').where('userId', '==', target))
    const balance = history.empty ? Number(profile.data()?.points || 0)
      : history.docs.reduce((sum, d) => sum + Number(d.data().amount || 0), 0)
    if (!Number.isSafeInteger(balance) || balance + amount < 0) throw new HttpsError('failed-precondition', '點數不足')
    const recurring = action === 'approveTask' && !value.selfReport && ['daily', 'weekly', 'monthly'].includes(value.recurrence)
    if (recurring) {
      // Recurring chores go back on the board so they can be done again; the history lives in transactions.
      tx.update(itemRef, { status: 'available', claimerId: null, claimNote: '', claimedAt: null,
        lastCompletedAt: Date.now(), completedCount: Number(value.completedCount || 0) + 1 })
    } else {
      tx.update(itemRef, { status: action === 'approveTask' ? 'approved' : 'redeemed', updatedAt: Date.now() })
    }
    tx.update(profileRef, { points: balance + amount })
    const record = db.collection('transactions').doc()
    tx.create(record, { id: record.id, userId: target, coupleId: value.coupleId, amount,
      reason: `${action === 'approveTask' ? '完成任務' : '兌換願望'}：${value.title}`, relatedId: itemId, createdAt: Date.now() })
  })
  return { ok: true }
})

// Older records were written before the server kept users.points in sync; recompute it from the ledger.
export const reconcilePoints = onCall(options, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '請先登入')
  const profileRef = db.doc(`users/${identifier(req.auth.uid)}`)
  return db.runTransaction(async (tx) => {
    const [profile, history] = await Promise.all([tx.get(profileRef), tx.get(db.collection('transactions').where('userId', '==', req.auth!.uid))])
    if (!profile.exists) throw new HttpsError('not-found', '找不到帳號資料')
    const balance = history.docs.reduce((sum, d) => sum + Number(d.data().amount || 0), 0)
    if (!Number.isSafeInteger(balance)) throw new HttpsError('failed-precondition', '點數紀錄異常')
    if (profile.data()?.points !== balance) tx.update(profileRef, { points: balance })
    return { points: balance }
  })
})

export const readPrivateImage = onCall(options, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '請先登入')
  const path = req.data?.path
  if (typeof path !== 'string' || path.length > 512 || path.includes('..')) throw new HttpsError('invalid-argument', '圖片路徑無效')
  const profile = await db.doc(`users/${req.auth.uid}`).get()
  const coupleId = identifier(profile.data()?.coupleId)
  const couple = await db.doc(`couples/${coupleId}`).get()
  if (!couple.data()?.members?.includes(req.auth.uid)) throw new HttpsError('permission-denied', '未配對')
  if (!path.startsWith(`couples/${coupleId}/`)) {
    // Legacy ownership is assigned by the administrator's migration, never by client records.
    if (!/^(wish-images|expense-images)\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(path)) throw new HttpsError('permission-denied', '無法讀取此圖片')
  } else if (!/^couples\/[^/]+\/[^/]+\/(wish-images|expense-images)\/[A-Za-z0-9_-]+\.jpg$/.test(path)) {
    throw new HttpsError('permission-denied', '無效圖片路徑')
  }
  const file = getStorage().bucket().file(path)
  const [metadata] = await file.getMetadata()
  if (!path.startsWith('couples/') && metadata.metadata?.wishlinkCoupleId !== coupleId) {
    throw new HttpsError('permission-denied', '舊圖片尚未確認歸屬，請聯絡管理員')
  }
  if (Number(metadata.size) > 5 * 1024 * 1024 || !/^image\/(jpeg|png|webp|gif)$/.test(metadata.contentType || '')) {
    throw new HttpsError('failed-precondition', '圖片格式不支援')
  }
  const [bytes] = await file.download()
  return { dataURL: `data:${metadata.contentType};base64,${bytes.toString('base64')}` }
})
