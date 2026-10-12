export type WishStatus = 'pending' | 'approved' | 'rejected' | 'deferred' | 'redeemed' | 'completed'
export type UrgencyLevel = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'available' | 'claimed' | 'approved' | 'rejected'
export type TaskRecurrence = 'once' | 'daily' | 'weekly' | 'monthly'

export type AppUser = {
  id: string
  email: string
  nickname: string
  coupleId?: string | null
  points: number
  createdAt?: number
}

export type Wish = {
  id: string
  authorId: string
  coupleId: string
  title: string
  description: string
  persuasion: string
  desireLevel: number
  urgency: UrgencyLevel
  estimatedPrice?: number | null
  purchaseURL?: string
  imageURLs: string[]
  selfPurchase: boolean
  status: WishStatus
  rejectionReason?: string
  deferredPoints?: number | null
  createdAt: number
  updatedAt: number
}

export type ChoreTask = {
  id: string
  coupleId: string
  creatorId: string
  claimerId?: string | null
  title: string
  points: number
  recurrence: TaskRecurrence
  status: TaskStatus
  claimNote?: string
  rejectionReason?: string
  selfReport?: boolean
  createdAt: number
  claimedAt?: number | null
  lastCompletedAt?: number
  completedCount?: number
}

export type PointTransaction = {
  id: string
  userId: string
  coupleId: string
  amount: number
  reason: string
  relatedId?: string
  createdAt: number
}

export type ExpenseCategory =
  | 'food' | 'shopping' | 'transport' | 'entertainment'
  | 'home' | 'travel' | 'gift' | 'other'

export type Currency = 'TWD' | 'HKD' | 'USD' | 'JPY'

export type FundEntry = {
  id: string
  coupleId: string
  userId: string              // who paid
  amount: number              // total paid in `currency`
  currency?: Currency         // currency of `amount`; default TWD if missing
  payerShare?: number | null  // payer's own share of `amount`; partner share = amount - payerShare; undefined → split equally (amount/2)
  category?: ExpenseCategory
  imageURLs?: string[]        // receipt photos
  note: string
  createdAt: number
}

export type CoupleMessage = {
  id: string
  coupleId: string
  authorId: string
  body: string
  createdAt: number
}

export type GeoPoint = { lat: number; lng: number; label: string }

export type BusRoute = {
  id: string
  coupleId: string
  ownerId: string
  name: string                // 上班 / 下班 / 健身房 ...
  origin: GeoPoint
  destination: GeoPoint
  createdAt: number
  order?: number
}

export type CoupleData = {
  calendarEvents: CalendarEvent[]
  shoppingItems: ShoppingItem[]
  partner?: AppUser | null
  wishes: Wish[]
  tasks: ChoreTask[]
  transactions: PointTransaction[]
  fundEntries: FundEntry[]
  messages: CoupleMessage[]
  busRoutes: BusRoute[]
  giftCoupons: GiftCoupon[]
  giftRedemptions: GiftRedemption[]
}

export type CalendarEvent = {
  id: string
  coupleId: string
  authorId: string
  title: string
  start: string
  end: string
  allDay: boolean
  recurrence: TaskRecurrence
  participant: 'both' | 'me' | 'partner'
  note: string
  createdAt: number
}

export type ShoppingItem = {
  id: string
  coupleId: string
  authorId: string
  list: string
  title: string
  quantity: string
  category: string
  note: string
  purchased: boolean
  createdAt: number
}

export type GiftTheme = 'coffee' | 'rose' | 'night'

export type GiftCoupon = {
  id: string
  coupleId: string
  issuerId: string            // who gives the gift and fulfils each use (e.g. the barista)
  holderId: string            // who receives the gift
  title: string
  subtitle: string
  note: string
  theme: GiftTheme
  totalUses: number
  remainingUses: number       // maintained by the redeemGiftCoupon function only
  startsAt: number
  expiresAt: number
  createdAt: number
  updatedAt: number
}

export type GiftRedemption = {
  id: string
  couponId: string
  coupleId: string
  holderId: string
  redeemedBy: string
  note: string
  remainingAfter: number
  undone: boolean
  undoneBy?: string
  undoneAt?: number
  createdAt: number
}
