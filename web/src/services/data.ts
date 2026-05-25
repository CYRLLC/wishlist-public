import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from './firebase'
import type { AppUser, ChoreTask, CoupleData, CoupleMessage, FundEntry, PointTransaction, Wish, WishStatus } from '../types'

export { isFirebaseConfigured } from './firebase'

const localKey = 'wishlink-web-demo'

type LocalState = {
  users: AppUser[]
  currentUserId?: string
  wishes: Wish[]
  tasks: ChoreTask[]
  transactions: PointTransaction[]
  fundEntries: FundEntry[]
  messages: CoupleMessage[]
}

const seed: LocalState = {
  users: [
    { id: 'demo-a', email: 'a@wish.local', nickname: '小寧', coupleId: 'demo-couple', points: 18 },
    { id: 'demo-b', email: 'b@wish.local', nickname: '阿宇', coupleId: 'demo-couple', points: 12 },
  ],
  currentUserId: 'demo-a',
  wishes: [
    {
      id: 'wish-1',
      authorId: 'demo-a',
      coupleId: 'demo-couple',
      title: '週末溫泉小旅行',
      description: '想找一天完全離線，好好休息。',
      persuasion: '我會負責排行程，也會把平日任務補滿。',
      desireLevel: 5,
      urgency: 'high',
      estimatedPrice: 6200,
      purchaseURL: '',
      imageURLs: [],
      selfPurchase: true,
      status: 'deferred',
      deferredPoints: 30,
      createdAt: Date.now() - 900000,
      updatedAt: Date.now() - 900000,
    },
    {
      id: 'wish-2',
      authorId: 'demo-b',
      coupleId: 'demo-couple',
      title: '新耳機',
      description: '通勤跟工作都會用到。',
      persuasion: '可以讓我少抱怨捷運噪音。',
      desireLevel: 4,
      urgency: 'medium',
      estimatedPrice: 3800,
      purchaseURL: '',
      imageURLs: [],
      selfPurchase: false,
      status: 'pending',
      createdAt: Date.now() - 600000,
      updatedAt: Date.now() - 600000,
    },
  ],
  tasks: [
    { id: 'task-1', coupleId: 'demo-couple', creatorId: 'demo-b', title: '洗碗', points: 8, recurrence: 'daily', status: 'available', createdAt: Date.now() - 300000 },
    { id: 'task-2', coupleId: 'demo-couple', creatorId: 'demo-a', claimerId: 'demo-b', title: '按摩 15 分鐘', points: 10, recurrence: 'weekly', status: 'claimed', claimNote: '今晚完成', createdAt: Date.now() - 200000, claimedAt: Date.now() - 100000 },
  ],
  transactions: [
    { id: 'tx-1', userId: 'demo-a', coupleId: 'demo-couple', amount: 18, reason: '示範點數', createdAt: Date.now() - 500000 },
    { id: 'tx-2', userId: 'demo-b', coupleId: 'demo-couple', amount: 12, reason: '示範點數', createdAt: Date.now() - 400000 },
  ],
  fundEntries: [
    { id: 'fund-1', coupleId: 'demo-couple', userId: 'demo-a', amount: 1200, note: '本週存入', createdAt: Date.now() - 400000 },
    { id: 'fund-2', coupleId: 'demo-couple', userId: 'demo-b', amount: 800, note: '晚餐預算省下', createdAt: Date.now() - 250000 },
  ],
  messages: [
    { id: 'msg-1', coupleId: 'demo-couple', authorId: 'demo-b', body: '我剛剛看到你的溫泉願望了，先暫緩但可以一起集點。', createdAt: Date.now() - 180000 },
    { id: 'msg-2', coupleId: 'demo-couple', authorId: 'demo-a', body: '可以，我這週先把洗碗任務接起來。', createdAt: Date.now() - 120000 },
  ],
}

const id = () => crypto.randomUUID()
const now = () => Date.now()
const readLocal = (): LocalState => JSON.parse(localStorage.getItem(localKey) || 'null') || seed
const writeLocal = (state: LocalState) => localStorage.setItem(localKey, JSON.stringify(state))
const sortNewest = <T extends { createdAt: number }>(items: T[]) => [...items].sort((a, b) => b.createdAt - a.createdAt)

const normalizeTime = (value: unknown): number => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis()
  }
  return now()
}

const fromDoc = <T extends { createdAt?: number; updatedAt?: number }>(snap: { id: string; data: () => Record<string, unknown> }): T => {
  const data = snap.data()
  return {
    id: snap.id,
    ...data,
    createdAt: normalizeTime(data.createdAt),
    updatedAt: data.updatedAt ? normalizeTime(data.updatedAt) : undefined,
  } as unknown as T
}

export function observeAuth(onUser: (user: AppUser | null) => void) {
  if (!isFirebaseConfigured || !auth || !db) {
    const state = readLocal()
    writeLocal(state)
    onUser(state.users.find((u) => u.id === state.currentUserId) || null)
    return () => undefined
  }

  const firestore = db
  return onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
    if (!fbUser) return onUser(null)
    const snap = await getDoc(doc(firestore, 'users', fbUser.uid))
    onUser(snap.exists() ? ({ id: snap.id, ...snap.data() } as AppUser) : null)
  })
}

export async function register(email: string, password: string, nickname: string) {
  if (!isFirebaseConfigured || !auth || !db) {
    const state = readLocal()
    const user: AppUser = { id: `demo-${id().slice(0, 8)}`, email, nickname, points: 0, coupleId: null, createdAt: now() }
    state.users.push(user)
    state.currentUserId = user.id
    writeLocal(state)
    return user
  }

  const result = await createUserWithEmailAndPassword(auth, email, password)
  const user: AppUser = { id: result.user.uid, email, nickname, points: 0, coupleId: null, createdAt: now() }
  await setDoc(doc(db, 'users', user.id), user)
  return user
}

export async function login(email: string, password: string) {
  if (!isFirebaseConfigured || !auth || !db) {
    const state = readLocal()
    let user = state.users.find((item) => item.email === email)
    if (!user) {
      user = { id: `demo-${id().slice(0, 8)}`, email, nickname: email.split('@')[0] || '使用者', points: 0, coupleId: null, createdAt: now() }
      state.users.push(user)
    }
    state.currentUserId = user.id
    writeLocal(state)
    return user
  }

  const result = await signInWithEmailAndPassword(auth, email, password)
  const snap = await getDoc(doc(db, 'users', result.user.uid))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as AppUser) : null
}

export async function logout() {
  if (!isFirebaseConfigured || !auth) {
    const state = readLocal()
    state.currentUserId = undefined
    writeLocal(state)
    return
  }
  await signOut(auth)
}

export async function pairWithInviteCode(user: AppUser, partnerCode: string) {
  if (partnerCode === user.id) throw new Error('不能輸入自己的邀請碼')

  if (!isFirebaseConfigured || !db) {
    const state = readLocal()
    const partner = state.users.find((item) => item.id === partnerCode)
    if (!partner) throw new Error('找不到這個邀請碼')
    const coupleId = `couple-${id().slice(0, 8)}`
    state.users = state.users.map((item) => item.id === user.id || item.id === partner.id ? { ...item, coupleId } : item)
    writeLocal(state)
    return coupleId
  }

  const partnerRef = doc(db, 'users', partnerCode)
  const meRef = doc(db, 'users', user.id)
  const partnerSnap = await getDoc(partnerRef)
  if (!partnerSnap.exists()) throw new Error('找不到這個邀請碼')
  const coupleId = id()
  await setDoc(doc(db, 'couples', coupleId), { id: coupleId, members: [user.id, partnerCode], createdAt: now() })
  await updateDoc(meRef, { coupleId })
  await updateDoc(partnerRef, { coupleId })
  return coupleId
}

export function observeCoupleData(coupleId: string, userId: string, onData: (data: CoupleData) => void) {
  if (!isFirebaseConfigured || !db) {
    const state = readLocal()
    onData({
      partner: state.users.find((item) => item.coupleId === coupleId && item.id !== userId) || null,
      wishes: sortNewest(state.wishes.filter((item) => item.coupleId === coupleId)),
      tasks: sortNewest(state.tasks.filter((item) => item.coupleId === coupleId)),
      transactions: sortNewest(state.transactions.filter((item) => item.userId === userId)),
      fundEntries: sortNewest(state.fundEntries.filter((item) => item.coupleId === coupleId)),
      messages: sortNewest(state.messages.filter((item) => item.coupleId === coupleId)),
    })
    return () => undefined
  }

  const data: CoupleData = { partner: null, wishes: [], tasks: [], transactions: [], fundEntries: [], messages: [] }
  const emit = () => onData({ ...data })
  const unsubs = [
    onSnapshot(query(collection(db, 'users'), where('coupleId', '==', coupleId)), (snap) => {
      data.partner = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as AppUser).find((item) => item.id !== userId) || null
      emit()
    }),
    onSnapshot(query(collection(db, 'wishes'), where('coupleId', '==', coupleId)), (snap) => {
      data.wishes = sortNewest(snap.docs.map((docSnap) => fromDoc<Wish>(docSnap)))
      emit()
    }),
    onSnapshot(query(collection(db, 'tasks'), where('coupleId', '==', coupleId)), (snap) => {
      data.tasks = sortNewest(snap.docs.map((docSnap) => fromDoc<ChoreTask>(docSnap)))
      emit()
    }),
    onSnapshot(query(collection(db, 'transactions'), where('userId', '==', userId)), (snap) => {
      data.transactions = sortNewest(snap.docs.map((docSnap) => fromDoc<PointTransaction>(docSnap)))
      emit()
    }),
    onSnapshot(query(collection(db, 'fund_entries'), where('coupleId', '==', coupleId)), (snap) => {
      data.fundEntries = sortNewest(snap.docs.map((docSnap) => fromDoc<FundEntry>(docSnap)))
      emit()
    }),
    onSnapshot(query(collection(db, 'messages'), where('coupleId', '==', coupleId)), (snap) => {
      data.messages = sortNewest(snap.docs.map((docSnap) => fromDoc<CoupleMessage>(docSnap)))
      emit()
    }),
  ]
  return () => unsubs.forEach((unsub) => unsub())
}

export async function addWish(input: Omit<Wish, 'id' | 'status' | 'imageURLs' | 'createdAt' | 'updatedAt'>) {
  const wish: Wish = { ...input, selfPurchase: input.selfPurchase || false, id: id(), imageURLs: [], status: 'pending', createdAt: now(), updatedAt: now() }
  if (!isFirebaseConfigured || !db) {
    const state = readLocal(); state.wishes.push(wish); writeLocal(state); return wish
  }
  await setDoc(doc(db, 'wishes', wish.id), wish)
  return wish
}

export async function updateWishStatus(wishId: string, status: WishStatus, extra: Partial<Wish> = {}) {
  if (!isFirebaseConfigured || !db) {
    const state = readLocal()
    state.wishes = state.wishes.map((wish) => wish.id === wishId ? { ...wish, status, ...extra, updatedAt: now() } : wish)
    writeLocal(state)
    return
  }
  await updateDoc(doc(db, 'wishes', wishId), { status, ...extra, updatedAt: now() })
}

export async function redeemWish(wish: Wish, user: AppUser) {
  const cost = wish.deferredPoints || 0
  if (user.points < cost) throw new Error('點數還不夠兌換')

  if (!isFirebaseConfigured || !db) {
    const state = readLocal()
    state.wishes = state.wishes.map((item) => item.id === wish.id ? { ...item, status: 'redeemed', updatedAt: now() } : item)
    state.users = state.users.map((item) => item.id === user.id ? { ...item, points: item.points - cost } : item)
    state.transactions.push({ id: id(), userId: user.id, coupleId: wish.coupleId, amount: -cost, reason: `兌換自己購買權：${wish.title}`, relatedId: wish.id, createdAt: now() })
    writeLocal(state)
    return
  }

  const firestore = db
  await runTransaction(firestore, async (transaction) => {
    const wishRef = doc(firestore, 'wishes', wish.id)
    const txRef = doc(firestore, 'transactions', id())
    transaction.update(wishRef, { status: 'redeemed', updatedAt: now() })
    transaction.set(txRef, { id: txRef.id, userId: user.id, coupleId: wish.coupleId, amount: -cost, reason: `兌換自己購買權：${wish.title}`, relatedId: wish.id, createdAt: now() })
  })
}

export async function addSelfReport(input: { coupleId: string; userId: string; title: string; note: string; points: number }) {
  const task: ChoreTask = {
    id: id(),
    coupleId: input.coupleId,
    creatorId: input.userId,
    claimerId: input.userId,
    title: input.title,
    points: input.points,
    recurrence: 'once',
    status: 'claimed',
    selfReport: true,
    ...(input.note ? { claimNote: input.note } : {}),
    createdAt: now(),
    claimedAt: now(),
  }
  if (!isFirebaseConfigured || !db) {
    const state = readLocal(); state.tasks.push(task); writeLocal(state); return task
  }
  await setDoc(doc(db, 'tasks', task.id), task)
  return task
}

export async function addTask(input: Omit<ChoreTask, 'id' | 'status' | 'createdAt'>) {
  const task: ChoreTask = { ...input, recurrence: input.recurrence || 'once', id: id(), status: 'available', createdAt: now() }
  if (!isFirebaseConfigured || !db) {
    const state = readLocal(); state.tasks.push(task); writeLocal(state); return task
  }
  await setDoc(doc(db, 'tasks', task.id), task)
  return task
}

export async function claimTask(taskId: string, claimerId: string, note: string) {
  const patch = { claimerId, claimNote: note, status: 'claimed' as const, claimedAt: now() }
  if (!isFirebaseConfigured || !db) {
    const state = readLocal(); state.tasks = state.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task); writeLocal(state); return
  }
  await updateDoc(doc(db, 'tasks', taskId), patch)
}

export async function approveTask(task: ChoreTask) {
  if (!task.claimerId) throw new Error('這個任務尚未有人申請')
  if (!isFirebaseConfigured || !db) {
    const state = readLocal()
    state.tasks = state.tasks.map((item) => item.id === task.id ? { ...item, status: 'approved' } : item)
    state.users = state.users.map((item) => item.id === task.claimerId ? { ...item, points: item.points + task.points } : item)
    state.transactions.push({ id: id(), userId: task.claimerId, coupleId: task.coupleId, amount: task.points, reason: `完成任務：${task.title}`, relatedId: task.id, createdAt: now() })
    writeLocal(state)
    return
  }

  const firestore = db
  await runTransaction(firestore, async (transaction) => {
    const txRef = doc(firestore, 'transactions', id())
    transaction.update(doc(firestore, 'tasks', task.id), { status: 'approved' })
    transaction.set(txRef, { id: txRef.id, userId: task.claimerId, coupleId: task.coupleId, amount: task.points, reason: `完成任務：${task.title}`, relatedId: task.id, createdAt: now() })
  })
}

export async function rejectTask(taskId: string, reason: string) {
  if (!isFirebaseConfigured || !db) {
    const state = readLocal(); state.tasks = state.tasks.map((task) => task.id === taskId ? { ...task, status: 'rejected', rejectionReason: reason } : task); writeLocal(state); return
  }
  await updateDoc(doc(db, 'tasks', taskId), { status: 'rejected', rejectionReason: reason })
}

export async function addFundEntry(input: Omit<FundEntry, 'id' | 'createdAt'>) {
  const entry: FundEntry = { ...input, id: id(), createdAt: now() }
  if (!isFirebaseConfigured || !db) {
    const state = readLocal(); state.fundEntries.push(entry); writeLocal(state); return entry
  }
  await setDoc(doc(db, 'fund_entries', entry.id), entry)
  return entry
}

export async function addMessage(input: Omit<CoupleMessage, 'id' | 'createdAt'>) {
  const message: CoupleMessage = { ...input, id: id(), createdAt: now() }
  if (!isFirebaseConfigured || !db) {
    const state = readLocal(); state.messages.push(message); writeLocal(state); return message
  }
  await setDoc(doc(db, 'messages', message.id), message)
  return message
}
