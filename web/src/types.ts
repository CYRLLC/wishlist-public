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
  claimedAt?: number
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

export type FundEntry = {
  id: string
  coupleId: string
  userId: string              // who paid
  amount: number              // total paid
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

export type CoupleData = {
  partner?: AppUser | null
  wishes: Wish[]
  tasks: ChoreTask[]
  transactions: PointTransaction[]
  fundEntries: FundEntry[]
  messages: CoupleMessage[]
}
