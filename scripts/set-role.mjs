import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

// Load .env.local from project root
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, "..", ".env.local")
try {
  const raw = readFileSync(envPath, "utf8")
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim()
  }
} catch (e) {
  console.error("Could not load .env.local:", e.message)
}

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
const SERVICE_ROLE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ""
).trim()

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// CHANGE THESE:
const email = "marvinhodge86@gmail.com"
const role = "ADMIN" // or "REVIEWER"

const run = async () => {
  // Find user by email
  const { data: users, error: listErr } = await admin.auth.admin.listUsers()
  if (listErr) throw listErr

  const user = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) throw new Error(`User not found for email: ${email}`)

  // Update app_metadata.role
  const { data, error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user.app_metadata ?? {}), role }
  })
  if (error) throw error

  console.log("Updated user:", data.user.email, "app_metadata:", data.user.app_metadata)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
