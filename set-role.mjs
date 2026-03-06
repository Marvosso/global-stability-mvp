import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

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