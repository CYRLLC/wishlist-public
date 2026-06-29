import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { auth, db, functions, isFirebaseConfigured, storage } from './firebase'
import type { AppUser, BusRoute, ChoreTask, CoupleData, CoupleMessage, Currency, FundEntry, GeoPoint, PointTransaction, Wish, WishStatus } from '../types'

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
  busRoutes: BusRoute[]
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
  busRoutes: [],
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
    if (!snap.exists()) return onUser(null)
    const userData = { id: snap.id, ...snap.data() } as AppUser
    if (!userData.coupleId) {
      const couplesSnap = await getDocs(query(collection(firestore, 'couples'), where('members', 'array-contains', fbUser.uid)))
      if (!couplesSnap.empty) {
        const coupleId = couplesSnap.docs[0].id
        await updateDoc(doc(firestore, 'users', fbUser.uid), { coupleId })
        userData.coupleId = coupleId
      }
    }
    onUser(userData)
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

  const partnerSnap = await getDoc(doc(db, 'users', partnerCode))
  if (!partnerSnap.exists()) throw new Error('找不到這個邀請碼')
  const coupleId = id()
  await setDoc(doc(db, 'couples', coupleId), { id: coupleId, members: [user.id, partnerCode], createdAt: now() })
  await updateDoc(doc(db, 'users', user.id), { coupleId })
  // Partner's coupleId is auto-detected from the couples collection on their next app load
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
      busRoutes: sortNewest(state.busRoutes.filter((item) => item.coupleId === coupleId)),
    })
    return () => undefined
  }

  const data: CoupleData = { partner: null, wishes: [], tasks: [], transactions: [], fundEntries: [], messages: [], busRoutes: [] }
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
    onSnapshot(query(collection(db, 'bus_routes'), where('coupleId', '==', coupleId)), (snap) => {
      data.busRoutes = sortNewest(snap.docs.map((docSnap) => fromDoc<BusRoute>(docSnap)))
      emit()
    }),
  ]
  return () => unsubs.forEach((unsub) => unsub())
}

export async function addWish(input: Omit<Wish, 'id' | 'status' | 'createdAt' | 'updatedAt'>) {
  const wish: Wish = { ...input, selfPurchase: input.selfPurchase || false, id: id(), status: 'pending', createdAt: now(), updatedAt: now() }
  if (!isFirebaseConfigured || !db) {
    const state = readLocal(); state.wishes.push(wish); writeLocal(state); return wish
  }
  await setDoc(doc(db, 'wishes', wish.id), wish)
  return wish
}

export async function updateWish(wishId: string, patch: Partial<Omit<Wish, 'id' | 'authorId' | 'coupleId' | 'status' | 'createdAt' | 'updatedAt'>>) {
  if (!isFirebaseConfigured || !db) {
    const state = readLocal()
    state.wishes = state.wishes.map((w) => w.id === wishId ? { ...w, ...patch, updatedAt: now() } : w)
    writeLocal(state)
    return
  }
  await updateDoc(doc(db, 'wishes', wishId), { ...patch, updatedAt: now() })
}

export async function deleteWish(wishId: string) {
  if (!isFirebaseConfigured || !db) {
    const state = readLocal()
    state.wishes = state.wishes.filter((w) => w.id !== wishId)
    writeLocal(state)
    return
  }
  await deleteDoc(doc(db, 'wishes', wishId))
}

export async function deleteFundEntry(entryId: string) {
  if (!isFirebaseConfigured || !db) {
    const state = readLocal()
    state.fundEntries = state.fundEntries.filter((e) => e.id !== entryId)
    writeLocal(state)
    return
  }
  await deleteDoc(doc(db, 'fund_entries', entryId))
}

async function compressImage(file: File, maxDim = 1920, quality = 0.85): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 500 * 1024) {
      bitmap.close()
      return file
    }
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close(); return file }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
  } catch {
    return file
  }
}

async function uploadImage(file: File, folder: 'wish-images' | 'expense-images'): Promise<string> {
  const compressed = await compressImage(file)
  if (!isFirebaseConfigured || !storage) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('圖片讀取失敗'))
      reader.readAsDataURL(compressed)
    })
  }
  const path = `${folder}/${id()}.jpg`
  const ref = storageRef(storage, path)
  const snapshot = await uploadBytes(ref, compressed, { contentType: compressed.type || 'image/jpeg' })
  return getDownloadURL(snapshot.ref)
}

export const uploadWishImage = (file: File) => uploadImage(file, 'wish-images')
export const uploadExpenseImage = (file: File) => uploadImage(file, 'expense-images')

// Exchange rates relative to USD (1 USD = X).
// Fallback values are approximate (2026-05). Real-time rates fetched on demand and cached for 24h.
const FALLBACK_RATES: Record<Currency, number> = {
  USD: 1,
  TWD: 31,
  HKD: 7.8,
  JPY: 150,
}

const RATES_CACHE_KEY = 'wishlink-fx-rates'
const RATES_CACHE_TTL = 24 * 60 * 60 * 1000

export async function getExchangeRates(): Promise<Record<Currency, number>> {
  try {
    const cached = JSON.parse(localStorage.getItem(RATES_CACHE_KEY) || 'null')
    if (cached && cached.ts && Date.now() - cached.ts < RATES_CACHE_TTL && cached.rates) {
      return cached.rates
    }
  } catch {}
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    if (!res.ok) throw new Error('rates fetch failed')
    const data = await res.json()
    const r = data?.rates || {}
    const rates: Record<Currency, number> = {
      USD: 1,
      TWD: Number(r.TWD) || FALLBACK_RATES.TWD,
      HKD: Number(r.HKD) || FALLBACK_RATES.HKD,
      JPY: Number(r.JPY) || FALLBACK_RATES.JPY,
    }
    localStorage.setItem(RATES_CACHE_KEY, JSON.stringify({ ts: Date.now(), rates }))
    return rates
  } catch {
    return FALLBACK_RATES
  }
}

// Convert `amount` in currency `from` into currency `to`, using rates-relative-to-USD.
export function convertAmount(amount: number, from: Currency, to: Currency, rates: Record<Currency, number>): number {
  if (from === to) return amount
  const usd = amount / (rates[from] || FALLBACK_RATES[from])
  return usd * (rates[to] || FALLBACK_RATES[to])
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

// ─── Bus routes ───────────────────────────────────────────────────────────────

export async function addBusRoute(input: Omit<BusRoute, 'id' | 'createdAt'>) {
  const route: BusRoute = { ...input, id: id(), createdAt: now() }
  if (!isFirebaseConfigured || !db) {
    const state = readLocal(); state.busRoutes.push(route); writeLocal(state); return route
  }
  await setDoc(doc(db, 'bus_routes', route.id), route)
  return route
}

export async function updateBusRoute(routeId: string, patch: Partial<Omit<BusRoute, 'id' | 'coupleId' | 'ownerId' | 'createdAt'>>) {
  if (!isFirebaseConfigured || !db) {
    const state = readLocal()
    state.busRoutes = state.busRoutes.map((r) => r.id === routeId ? { ...r, ...patch } : r)
    writeLocal(state); return
  }
  await updateDoc(doc(db, 'bus_routes', routeId), patch)
}

export async function deleteBusRoute(routeId: string) {
  if (!isFirebaseConfigured || !db) {
    const state = readLocal()
    state.busRoutes = state.busRoutes.filter((r) => r.id !== routeId)
    writeLocal(state); return
  }
  await deleteDoc(doc(db, 'bus_routes', routeId))
}

// ─── TDX proxy call ───────────────────────────────────────────────────────────

export async function callTdx<T = unknown>(path: string, query?: Record<string, string | number>): Promise<T> {
  if (!isFirebaseConfigured || !functions) {
    throw new Error('需要 Firebase 才能查公車資料（本機模式不支援）')
  }
  const fn = httpsCallable<{ path: string; query?: Record<string, string | number> }, T>(functions, 'tdxProxy')
  const res = await fn({ path, query })
  return res.data
}

// ─── TDX bus query helpers ────────────────────────────────────────────────────

const BUS_CITIES = ['Taipei', 'NewTaipei'] as const
type City = typeof BUS_CITIES[number]

export type TdxStop = {
  StopUID: string
  StopID: string
  StopName: { Zh_tw: string; En?: string }
  StopPosition: { PositionLat: number; PositionLon: number }
  city: City
}

type TdxStopOfRouteRaw = {
  RouteUID: string
  RouteName: { Zh_tw: string; En?: string }
  Direction: 0 | 1
  Stops: { StopUID: string; StopName: { Zh_tw: string } }[]
}

type StopRouteEntry = {
  routeUID: string
  routeName: string
  direction: 0 | 1
  index: number
  city: City
}

export type BusOption = {
  routeUID: string
  routeName: string
  direction: 0 | 1
  city: City
  destinationStopName: string  // dest stop name on this route
  eta?: number | null          // seconds; null = 尚未發車/末班過/未營運
  etaStatus?: number           // 0 normal, 1=未發車, 2=交管, 3=末班過, 4=未營運
}

export type StopGroup = {
  stop: TdxStop
  options: BusOption[]
}

const STOP_INDEX_KEY = 'wishlink-bus-stop-index-v1'
const STOP_INDEX_TTL = 7 * 24 * 60 * 60 * 1000

type CachedStopIndex = {
  ts: number
  byStop: Record<string, StopRouteEntry[]>
  // routeKey = routeUID + '-' + direction → ordered stop UIDs
  routeStops: Record<string, string[]>
}

async function buildStopIndex(): Promise<CachedStopIndex> {
  const cities: City[] = ['Taipei', 'NewTaipei']
  const results = await Promise.all(
    cities.map((c) => callTdx<TdxStopOfRouteRaw[]>(`Bus/StopOfRoute/City/${c}`, { $top: 8000 }))
  )
  const byStop: Record<string, StopRouteEntry[]> = {}
  const routeStops: Record<string, string[]> = {}
  cities.forEach((city, ci) => {
    for (const r of results[ci]) {
      const key = `${r.RouteUID}-${r.Direction}`
      routeStops[key] = r.Stops.map((s) => s.StopUID)
      r.Stops.forEach((s, idx) => {
        if (!byStop[s.StopUID]) byStop[s.StopUID] = []
        byStop[s.StopUID].push({
          routeUID: r.RouteUID,
          routeName: r.RouteName.Zh_tw,
          direction: r.Direction,
          index: idx,
          city,
        })
      })
    }
  })
  const cache: CachedStopIndex = { ts: Date.now(), byStop, routeStops }
  try { localStorage.setItem(STOP_INDEX_KEY, JSON.stringify(cache)) } catch {}
  return cache
}

async function getStopIndex(forceRefresh = false): Promise<CachedStopIndex> {
  if (!forceRefresh) {
    try {
      const cached = JSON.parse(localStorage.getItem(STOP_INDEX_KEY) || 'null')
      if (cached && cached.ts && Date.now() - cached.ts < STOP_INDEX_TTL) return cached
    } catch {}
  }
  return buildStopIndex()
}

async function getNearbyStops(lat: number, lng: number, radius = 300): Promise<TdxStop[]> {
  const cities: City[] = ['Taipei', 'NewTaipei']
  const out = await Promise.all(
    cities.map(async (city) => {
      const stops = await callTdx<Omit<TdxStop, 'city'>[]>(`Bus/Stop/City/${city}`, {
        $spatialFilter: `nearby(${lat},${lng},${radius})`,
        $top: 30,
      })
      return stops.map((s) => ({ ...s, city }))
    })
  )
  const seen = new Set<string>()
  return out.flat().filter((s) => {
    if (seen.has(s.StopUID)) return false
    seen.add(s.StopUID); return true
  })
}

type TdxEta = {
  StopUID: string
  RouteUID: string
  Direction: 0 | 1
  EstimateTime?: number
  StopStatus?: number
}

async function fetchEtas(matches: { city: City; routeName: string; stopUID: string; routeUID: string }[]): Promise<Map<string, TdxEta>> {
  // Group by city + routeName so one query covers all stops on that route.
  const byRoute = new Map<string, { city: City; routeName: string; stopUIDs: Set<string> }>()
  for (const m of matches) {
    const key = `${m.city}::${m.routeName}`
    if (!byRoute.has(key)) byRoute.set(key, { city: m.city, routeName: m.routeName, stopUIDs: new Set() })
    byRoute.get(key)!.stopUIDs.add(m.stopUID)
  }
  const out = new Map<string, TdxEta>()
  await Promise.all(
    Array.from(byRoute.values()).map(async ({ city, routeName, stopUIDs }) => {
      try {
        const etas = await callTdx<TdxEta[]>(`Bus/EstimatedTimeOfArrival/City/${city}/${encodeURIComponent(routeName)}`, { $top: 200 })
        for (const e of etas) {
          if (stopUIDs.has(e.StopUID)) {
            out.set(`${e.RouteUID}-${e.Direction}-${e.StopUID}`, e)
          }
        }
      } catch {
        // swallow per-route failures
      }
    })
  )
  return out
}

export async function findBusOptions(origin: GeoPoint, destination: GeoPoint, radius = 300): Promise<{ groups: StopGroup[]; warning?: string }> {
  const [originStops, destStops] = await Promise.all([
    getNearbyStops(origin.lat, origin.lng, radius),
    getNearbyStops(destination.lat, destination.lng, radius),
  ])
  if (originStops.length === 0) return { groups: [], warning: `起點附近 ${radius}m 內找不到公車站牌` }
  if (destStops.length === 0) return { groups: [], warning: `終點附近 ${radius}m 內找不到公車站牌` }

  const index = await getStopIndex()
  const destStopUIDs = new Set(destStops.map((s) => s.StopUID))

  const groups: StopGroup[] = []
  const etaJobs: { city: City; routeName: string; stopUID: string; routeUID: string }[] = []

  for (const oStop of originStops) {
    const routesAtO = index.byStop[oStop.StopUID] || []
    const options: BusOption[] = []
    const seenRouteKey = new Set<string>()
    for (const re of routesAtO) {
      const key = `${re.routeUID}-${re.direction}`
      if (seenRouteKey.has(key)) continue
      const stopList = index.routeStops[key] || []
      // Look for a dest stop after the origin index, same route+direction.
      for (let j = re.index + 1; j < stopList.length; j++) {
        if (destStopUIDs.has(stopList[j])) {
          const destStop = destStops.find((s) => s.StopUID === stopList[j])
          if (destStop) {
            options.push({
              routeUID: re.routeUID,
              routeName: re.routeName,
              direction: re.direction,
              city: re.city,
              destinationStopName: destStop.StopName.Zh_tw,
            })
            etaJobs.push({ city: re.city, routeName: re.routeName, stopUID: oStop.StopUID, routeUID: re.routeUID })
            seenRouteKey.add(key)
            break
          }
        }
      }
    }
    if (options.length > 0) groups.push({ stop: oStop, options })
  }

  if (etaJobs.length === 0) return { groups: [], warning: '附近找不到能到達目的地的路線' }

  const etaMap = await fetchEtas(etaJobs)
  for (const g of groups) {
    for (const opt of g.options) {
      const eta = etaMap.get(`${opt.routeUID}-${opt.direction}-${g.stop.StopUID}`)
      if (eta) {
        opt.eta = eta.EstimateTime ?? null
        opt.etaStatus = eta.StopStatus
      }
    }
    g.options.sort((a, b) => (a.eta ?? 9999) - (b.eta ?? 9999))
  }
  groups.sort((a, b) => (a.options[0].eta ?? 9999) - (b.options[0].eta ?? 9999))

  return { groups }
}

// ─── Location search (TDX bus stops + Nominatim places) ──────────────────────

export type SearchResult = {
  type: 'stop' | 'place'
  lat: number
  lng: number
  label: string
  subtitle?: string
}

const NOMINATIM_VIEWBOX = '121.0,25.3,122.2,24.7'  // 雙北 bounding box (left,top,right,bottom)

async function searchBusStops(keyword: string): Promise<SearchResult[]> {
  const safe = keyword.replace(/'/g, "''")
  const cities: City[] = ['Taipei', 'NewTaipei']
  const results = await Promise.all(
    cities.map((c) => callTdx<TdxStop[]>(`Bus/Stop/City/${c}`, {
      $filter: `contains(StopName/Zh_tw,'${safe}')`,
      $top: 12,
    }).catch(() => [] as TdxStop[]))
  )
  const seen = new Set<string>()
  return results.flat().filter((s) => {
    const key = `${s.StopName.Zh_tw}-${s.StopPosition.PositionLat.toFixed(4)}-${s.StopPosition.PositionLon.toFixed(4)}`
    if (seen.has(key)) return false
    seen.add(key); return true
  }).slice(0, 15).map((s) => ({
    type: 'stop' as const,
    lat: s.StopPosition.PositionLat,
    lng: s.StopPosition.PositionLon,
    label: s.StopName.Zh_tw,
    subtitle: '公車站',
  }))
}

async function searchPlaces(keyword: string): Promise<SearchResult[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(keyword)}&format=json&countrycodes=tw&limit=8&viewbox=${NOMINATIM_VIEWBOX}&bounded=1&accept-language=zh-TW`
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
    if (!res.ok) return []
    const data = (await res.json()) as { lat: string; lon: string; display_name: string; type?: string; class?: string }[]
    return data.map((p) => {
      const parts = p.display_name.split(',').map((x) => x.trim()).filter(Boolean)
      return {
        type: 'place' as const,
        lat: parseFloat(p.lat),
        lng: parseFloat(p.lon),
        label: parts[0] || p.display_name,
        subtitle: parts.slice(1, 3).join(' · ') || undefined,
      }
    })
  } catch {
    return []
  }
}

export async function searchLocation(keyword: string): Promise<SearchResult[]> {
  const trimmed = keyword.trim()
  if (trimmed.length < 1) return []
  const [stops, places] = await Promise.all([
    searchBusStops(trimmed),
    searchPlaces(trimmed),
  ])
  // 公車站排前面（對公車 App 來說最重要）
  return [...stops, ...places]
}

export function formatEta(option: BusOption): string {
  // StopStatus: 0=正常, 1=尚未發車, 2=交管, 3=末班過, 4=未營運, 5=不停靠站
  switch (option.etaStatus) {
    case 1: return '尚未發車'
    case 2: return '交管中'
    case 3: return '末班已過'
    case 4: return '今日未營運'
    case 5: return '不停靠'
  }
  if (option.eta == null) return '—'
  if (option.eta <= 60) return '進站中'
  return `${Math.floor(option.eta / 60)} 分`
}
