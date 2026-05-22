export type WishStatus = 'pending' | 'approved' | 'rejected' | 'deferred' | 'redeemed' | 'completed'
export type UrgencyLevel = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'available' | 'claimed' | 'approved' | 'rejected'

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
  status: TaskStatus
  claimNote?: string
  rejectionReason?: string
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

export type FundEntry = {
  id: string
  coupleId: string
  userId: string
  amount: number
  note: string
  createdAt: number
}

export type CoupleData = {
  wishes: Wish[]
  tasks: ChoreTask[]
  transactions: PointTransaction[]
  fundEntries: FundEntry[]
}
