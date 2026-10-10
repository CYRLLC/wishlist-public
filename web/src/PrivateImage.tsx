import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { loadPrivateImage } from './services/data'

export function PrivateImage({ src, alt = '', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [resolved, setResolved] = useState<{ source: string; url: string } | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    setResolved(null)
    setError(false)
    if (src) loadPrivateImage(src).then((url) => {
      if (active) setResolved({ source: src, url })
    }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [src])
  if (error) return <span role="status">無法讀取圖片，請確認登入與配對權限。</span>
  if (!resolved || resolved.source !== src) return <span role="status">圖片載入中…</span>
  return <img {...props} src={resolved.url} alt={alt} />
}
