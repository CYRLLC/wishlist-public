// Run with Application Default Credentials. Dry-run is the default.
const { initializeApp, applicationDefault } = require('firebase-admin/app')
const { getStorage } = require('firebase-admin/storage')
const { getFirestore } = require('firebase-admin/firestore')
const { randomUUID } = require('node:crypto')

async function main() {
  const [projectId, bucketName, flag] = process.argv.slice(2)
  if (!projectId || !bucketName || !['--dry-run', '--apply', undefined].includes(flag)) {
    throw new Error('Usage: node scripts/revoke-image-tokens.cjs PROJECT_ID BUCKET [--dry-run|--apply]')
  }
  initializeApp({ credential: applicationDefault(), projectId, storageBucket: bucketName })
  const owners = new Map()
  for (const collection of ['wishes', 'fund_entries']) {
    const records = await getFirestore().collection(collection).get()
    for (const record of records.docs) {
      const cid = record.data().coupleId
      if (typeof cid !== 'string') continue
      for (const source of record.data().imageURLs || []) {
        try {
          const url = new URL(source)
          if (url.hostname !== 'firebasestorage.googleapis.com' || decodeURIComponent(url.pathname.split('/b/')[1]?.split('/o/')[0] || '') !== bucketName) continue
          const path = decodeURIComponent(url.pathname.split('/o/')[1] || '')
          if (!/^(wish-images|expense-images)\//.test(path)) continue
          if (!owners.has(path)) owners.set(path, new Set())
          owners.get(path).add(cid)
        } catch { /* Ignore non-Storage references. */ }
      }
    }
  }
  let count = 0, ambiguous = 0
  for (const prefix of ['wish-images/', 'expense-images/', 'couples/']) {
    const [files] = await getStorage().bucket().getFiles({ prefix })
    for (const file of files) {
      const [metadata] = await file.getMetadata()
      const legacy = !file.name.startsWith('couples/')
      const candidates = owners.get(file.name)
      const owner = candidates?.size === 1 ? [...candidates][0] : null
      if (legacy && !owner) ambiguous++
      if (!legacy && !metadata.metadata?.firebaseStorageDownloadTokens) continue
      count++
      if (flag === '--apply') {
        // Rotate to an undisclosed token; deleting it may cause Firebase to regenerate it.
        await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: randomUUID(),
          ...(legacy ? { wishlinkCoupleId: owner } : {}) } }, {
          ifMetagenerationMatch: Number(metadata.metageneration),
        })
      }
    }
  }
  console.log(`${flag === '--apply' ? 'Revoked' : 'Would revoke'} download tokens on ${count} files. No files deleted.`)
  console.log(`${ambiguous} legacy files have unknown/ambiguous ownership and remain inaccessible until administrator review.`)
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
