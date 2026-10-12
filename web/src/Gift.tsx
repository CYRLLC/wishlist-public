import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Coffee, Copy, Gift, Lock, Nfc, Pencil, QrCode, RotateCcw, Trash2 } from 'lucide-react'
import type { AppUser, CoupleData, GiftCoupon, GiftRedemption, GiftTheme } from './types'
import { createGiftCoupon, deleteGiftCoupon, redeemGiftCoupon, undoGiftRedemption, updateGiftCoupon } from './services/data'

type Run = (task: () => Promise<void>) => void
const DAY = 24 * 60 * 60 * 1000
const UNDO_WINDOW = DAY

const pad = (n: number) => String(n).padStart(2, '0')
const toDateInput = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const fromDateInput = (value: string, endOfDay = false) => new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`).getTime()
const shortDate = (ms: number) => new Date(ms).toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })
export const giftLink = (couponId: string) => {
  const url = new URL(location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('gift', couponId)
  return url.toString()
}

const themes: { id: GiftTheme; label: string }[] = [
  { id: 'coffee', label: '咖啡' },
  { id: 'rose', label: '玫瑰' },
  { id: 'night', label: '夜空' },
]

// Preset for this year's birthday coffee card; last year's was a static Wallet pass with the same wording.
const birthdayPreset = () => {
  const today = new Date()
  const year = today > new Date(today.getFullYear(), 10, 15, 23, 59, 59) ? today.getFullYear() + 1 : today.getFullYear()
  return {
    title: '寶的咖啡師',
    subtitle: `${year} 生日禮物咖啡券`,
    note: `生日快樂！${year}/11/15 起一年內，憑券可兌換咖啡師親手做的咖啡。每杯扣一次，想喝就說。`,
    theme: 'coffee' as GiftTheme,
    totalUses: 365,
    start: `${year}-11-15`,
    end: `${year + 1}-11-15`,
  }
}

export function GiftPanel({ user, data, run, focusCouponId, onFocusHandled }: { user: AppUser; data: CoupleData; run: Run; focusCouponId?: string | null; onFocusHandled: () => void }) {
  const [creating, setCreating] = useState(false)
  const [redeeming, setRedeeming] = useState<GiftCoupon | null>(null)
  const partnerName = data.partner?.nickname || '對方'
  const nameOf = (uid: string) => uid === user.id ? '我' : partnerName
  const now = Date.now()
  const sorted = [...data.giftCoupons].sort((a, b) => Number(couponState(a, now) !== 'active') - Number(couponState(b, now) !== 'active') || b.startsAt - a.startsAt)

  useEffect(() => {
    if (!focusCouponId) return
    const coupon = data.giftCoupons.find((c) => c.id === focusCouponId)
    if (coupon) { setRedeeming(coupon); onFocusHandled() }
  }, [focusCouponId, data.giftCoupons, onFocusHandled])

  return (
    <section className="stack">
      <div className="section-head">
        <div><h1>禮物券</h1><p>送給對方的次數券，用一次扣一次，兩邊即時同步。</p></div>
        <button className="primary compact" onClick={() => setCreating(!creating)}><Gift size={16} />{creating ? '收起' : '送一張禮物券'}</button>
      </div>
      <aside className="guide-card">
        <strong>怎麼扣次數</strong>
        <ol>
          <li>收到的人打開卡片按「兌換一次」，或讓送禮的人用相機掃卡片上的 QR Code。</li>
          <li>想用「感應」：把卡片的感應連結寫進 NFC 貼紙貼在咖啡機旁，iPhone 靠近就會跳出兌換畫面。</li>
          <li>按錯了沒關係，24 小時內可以在紀錄裡復原。</li>
        </ol>
      </aside>
      {creating && <CouponForm user={user} partnerId={data.partner?.id} partnerName={partnerName} run={run} done={() => setCreating(false)} />}
      {sorted.length === 0 && !creating && <div className="empty">還沒有禮物券。點右上角「送一張禮物券」，可以直接套用生日咖啡券範本。</div>}
      <div className="gift-list">
        {sorted.map((coupon) => (
          <CouponCard key={coupon.id} coupon={coupon} user={user} nameOf={nameOf}
            redemptions={data.giftRedemptions.filter((r) => r.couponId === coupon.id)}
            onRedeem={() => setRedeeming(coupon)} run={run} />
        ))}
      </div>
      {redeeming && <RedeemDialog coupon={data.giftCoupons.find((c) => c.id === redeeming.id) || redeeming} user={user} nameOf={nameOf} run={run} close={() => setRedeeming(null)} />}
    </section>
  )
}

type CouponState = 'locked' | 'active' | 'used-up' | 'expired'
function couponState(coupon: GiftCoupon, now: number): CouponState {
  if (now < coupon.startsAt) return 'locked'
  if (now > coupon.expiresAt) return 'expired'
  if (coupon.remainingUses <= 0) return 'used-up'
  return 'active'
}

function CouponCard({ coupon, user, nameOf, redemptions, onRedeem, run }: { coupon: GiftCoupon; user: AppUser; nameOf: (uid: string) => string; redemptions: GiftRedemption[]; onRedeem: () => void; run: Run }) {
  const [showQr, setShowQr] = useState(false)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState('')
  const now = Date.now()
  const state = couponState(coupon, now)
  const isIssuer = coupon.issuerId === user.id
  const valid = redemptions.filter((r) => !r.undone)
  const used = coupon.totalUses - coupon.remainingUses
  const thisMonth = valid.filter((r) => { const d = new Date(r.createdAt), t = new Date(now); return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() }).length
  const daysLeft = Math.max(0, Math.ceil((coupon.expiresAt - now) / DAY))

  // The holder only sees a teaser until the gift unlocks, so it can be prepared ahead of the birthday.
  if (state === 'locked' && !isIssuer) {
    const days = Math.ceil((coupon.startsAt - now) / DAY)
    return (
      <article className={`gift-card theme-${coupon.theme} locked`}>
        <Lock size={34} />
        <strong>有一份禮物正在準備中</strong>
        <span>{days <= 1 ? '明天' : `${days} 天後`}解鎖</span>
      </article>
    )
  }

  if (editing) return <CouponForm user={user} initial={coupon} partnerId={coupon.holderId} partnerName={nameOf(coupon.holderId)} run={run} done={() => setEditing(false)} />

  const copy = async () => {
    try { await navigator.clipboard.writeText(giftLink(coupon.id)); setCopied('已複製感應連結') } catch { setCopied(giftLink(coupon.id)) }
  }

  return (
    <div className="gift-wrap">
      <article className={`gift-card theme-${coupon.theme} ${state}`}>
        <header>
          <div><span className="gift-kicker"><Coffee size={14} />{coupon.subtitle || '禮物券'}</span><h2>{coupon.title}</h2></div>
          <span className="gift-state">{({ locked: `${shortDate(coupon.startsAt)} 解鎖`, active: '使用中', 'used-up': '已用完', expired: '已過期' })[state]}</span>
        </header>
        <div className="gift-count">
          <strong>{coupon.remainingUses}</strong>
          <span>/ {coupon.totalUses} 次</span>
        </div>
        <progress max={coupon.totalUses} value={coupon.remainingUses} aria-label="剩餘次數" />
        <dl>
          <div><dt>持有人</dt><dd>{nameOf(coupon.holderId)}</dd></div>
          <div><dt>送禮人</dt><dd>{nameOf(coupon.issuerId)}</dd></div>
          <div><dt>使用期限</dt><dd>{shortDate(coupon.startsAt)} – {shortDate(coupon.expiresAt)}</dd></div>
        </dl>
        {showQr && <QrBlock url={giftLink(coupon.id)} />}
        {coupon.note && <p className="gift-note">{coupon.note}</p>}
      </article>
      <div className="gift-stats">
        <div><span>已兌換</span><strong>{used}</strong></div>
        <div><span>本月</span><strong>{thisMonth}</strong></div>
        <div><span>剩餘天數</span><strong>{state === 'expired' ? 0 : daysLeft}</strong></div>
      </div>
      <div className="actions gift-actions">
        <button className="primary" disabled={state !== 'active'} onClick={onRedeem}><Coffee size={16} />兌換一次</button>
        <button onClick={() => setShowQr(!showQr)}><QrCode size={16} />{showQr ? '收起 QR' : '出示 QR'}</button>
        <button onClick={copy}><Nfc size={16} />感應連結</button>
        {isIssuer && <button onClick={() => setEditing(true)}><Pencil size={14} />編輯</button>}
        {isIssuer && <button onClick={() => { if (confirm(`刪除「${coupon.title}」？兌換紀錄會保留但看不到卡片。`)) run(() => deleteGiftCoupon(coupon.id)) }}><Trash2 size={14} /></button>}
      </div>
      {copied && <p className="muted gift-copied" role="status">{copied}{copied.startsWith('已複製') && <> <Copy size={12} /> 用 NFC Tools 等 App 寫入 NFC 貼紙（記錄類型選「網址 / URL」）。</>}</p>}
      <RedemptionLog redemptions={redemptions} nameOf={nameOf} user={user} run={run} />
    </div>
  )
}

function QrBlock({ url }: { url: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#2b1d18', light: '#ffffff' } }).then((value) => { if (alive) setSrc(value) })
    return () => { alive = false }
  }, [url])
  return <div className="gift-qr">{src ? <img src={src} alt="兌換用 QR Code" /> : <span>產生中…</span>}<small>用相機掃描即可開啟兌換畫面</small></div>
}

function RedemptionLog({ redemptions, nameOf, user, run }: { redemptions: GiftRedemption[]; nameOf: (uid: string) => string; user: AppUser; run: Run }) {
  const [expanded, setExpanded] = useState(false)
  if (redemptions.length === 0) return <p className="muted">還沒有兌換紀錄。</p>
  const shown = expanded ? redemptions : redemptions.slice(0, 5)
  return (
    <div className="gift-log">
      <h3>兌換紀錄</h3>
      {shown.map((r) => (
        <div className={r.undone ? 'gift-log-row undone' : 'gift-log-row'} key={r.id}>
          <div>
            <strong>{new Date(r.createdAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
            <span>{nameOf(r.redeemedBy)} 操作{r.note ? ` · ${r.note}` : ''}{r.undone ? ` · 已由${nameOf(r.undoneBy || '')}復原` : ` · 剩 ${r.remainingAfter} 次`}</span>
          </div>
          {!r.undone && Date.now() - r.createdAt < UNDO_WINDOW && (
            <button className="ghost" onClick={() => { if (confirm('復原這次兌換？次數會加回去。')) run(() => undoGiftRedemption(r, user.id)) }}><RotateCcw size={14} />復原</button>
          )}
        </div>
      ))}
      {redemptions.length > 5 && <button className="link" onClick={() => setExpanded(!expanded)}>{expanded ? '收起' : `顯示全部 ${redemptions.length} 筆`}</button>}
    </div>
  )
}

function RedeemDialog({ coupon, user, nameOf, run, close }: { coupon: GiftCoupon; user: AppUser; nameOf: (uid: string) => string; run: Run; close: () => void }) {
  // One id per dialog: tapping twice, or a retry after a flaky connection, still counts as one use.
  const requestId = useMemo(() => crypto.randomUUID(), [])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<number | null>(null)
  const state = couponState(coupon, Date.now())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, close])

  const redeem = async () => {
    setBusy(true); setError('')
    try { setResult(await redeemGiftCoupon(coupon, user.id, note.trim(), requestId)); run(async () => {}) }
    catch (err) { setError(err instanceof Error ? err.message : '兌換失敗') }
    finally { setBusy(false) }
  }

  return (
    <div className="gift-dialog-overlay" role="dialog" aria-modal="true" aria-label="兌換禮物券" onClick={() => { if (!busy) close() }}>
      <div className={`gift-dialog theme-${coupon.theme}`} onClick={(e) => e.stopPropagation()}>
        {result === null ? <>
          <span className="gift-kicker"><Coffee size={14} />{coupon.subtitle || '禮物券'}</span>
          <h2>{coupon.title}</h2>
          <p>目前剩 <b>{coupon.remainingUses}</b> 次。{user.id === coupon.holderId ? '要兌換一次嗎？' : `幫 ${nameOf(coupon.holderId)} 扣一次？`}</p>
          {state !== 'active' && <p className="form-error">{({ locked: '禮物券還沒開始使用', expired: '禮物券已過期', 'used-up': '次數已經用完了', active: '' })[state]}</p>}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註（選填，例如：燕麥拿鐵）" maxLength={100} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="gift-dialog-actions">
            <button className="primary" disabled={busy || state !== 'active'} onClick={redeem}>{busy ? '兌換中…' : '確認兌換一次'}</button>
            <button className="ghost" disabled={busy} onClick={close}>取消</button>
          </div>
        </> : <div className="gift-done">
          <Coffee size={48} />
          <h2>兌換成功！</h2>
          <p>還剩 <b>{result}</b> 次，好好享受。</p>
          <button className="primary" onClick={close}>完成</button>
        </div>}
      </div>
    </div>
  )
}

function CouponForm({ user, initial, partnerId, partnerName, run, done }: { user: AppUser; initial?: GiftCoupon; partnerId?: string; partnerName: string; run: Run; done: () => void }) {
  const preset = birthdayPreset()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [theme, setTheme] = useState<GiftTheme>(initial?.theme ?? 'coffee')
  const [totalUses, setTotalUses] = useState(String(initial?.totalUses ?? 10))
  const [start, setStart] = useState(initial ? toDateInput(initial.startsAt) : toDateInput(Date.now()))
  const [end, setEnd] = useState(initial ? toDateInput(initial.expiresAt) : toDateInput(Date.now() + 365 * DAY))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const applyPreset = () => {
    setTitle(preset.title); setSubtitle(preset.subtitle); setNote(preset.note); setTheme(preset.theme)
    setTotalUses(String(preset.totalUses)); setStart(preset.start); setEnd(preset.end)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!partnerId) { setError('還沒讀取到對方資料，請稍後再試'); return }
    setBusy(true); setError('')
    try {
      if (initial) {
        await updateGiftCoupon(initial.id, { title, subtitle, note, theme, expiresAt: fromDateInput(end, true) })
      } else {
        await createGiftCoupon({ coupleId: user.coupleId!, issuerId: user.id, holderId: partnerId, title, subtitle, note, theme,
          totalUses: Number(totalUses), startsAt: fromDateInput(start), expiresAt: fromDateInput(end, true) })
      }
      run(async () => {})
      done()
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="compose gift-form" onSubmit={submit}>
      <div className="section-head">
        <strong>{initial ? '編輯禮物券' : `送給 ${partnerName} 的禮物券`}</strong>
        {!initial && <button type="button" className="ghost" onClick={applyPreset}><Coffee size={14} />套用生日咖啡券</button>}
      </div>
      <div className="form-grid">
        <label>名稱<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} required placeholder="例如：寶的咖啡師" /></label>
        <label>副標題<input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={40} placeholder="例如：2026 生日禮物咖啡券" /></label>
      </div>
      <div className="form-grid">
        <label>總次數<input type="number" min={1} max={10000} value={totalUses} onChange={(e) => setTotalUses(e.target.value)} disabled={Boolean(initial)} required /></label>
        <label>卡片樣式<select value={theme} onChange={(e) => setTheme(e.target.value as GiftTheme)}>{themes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      </div>
      <div className="form-grid">
        <label>開始日（之前對方只會看到「準備中」）<input type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={Boolean(initial)} required /></label>
        <label>到期日<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required /></label>
      </div>
      <label>卡片背面的話<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="寫給對方的話或使用說明" /></label>
      {initial && <p className="muted">總次數與開始日建立後不能修改，避免兌換紀錄對不上。</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="actions">
        <button className="primary" disabled={busy}>{busy ? '儲存中…' : initial ? '儲存' : '送出禮物券'}</button>
        <button type="button" className="ghost" disabled={busy} onClick={done}>取消</button>
      </div>
    </form>
  )
}
