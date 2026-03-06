import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.RESEND_FROM ?? "Global Stability Alerts <onboarding@resend.dev>";

export type AlertEmailPayload = {
  eventTitle: string;
  location: string | null;
  severity: string;
  mapLink: string;
};

/**
 * Sends an alert email via Resend. No-op if RESEND_API_KEY is not set.
 * Returns true if sent, false if skipped or failed.
 */
export async function sendAlertEmail(to: string, payload: AlertEmailPayload): Promise<boolean> {
  if (!resendApiKey || !to?.trim()) return false;

  const { eventTitle, location, severity, mapLink } = payload;
  const subject = `Alert: ${eventTitle?.trim() || "New event"}`;
  const locationLine = location?.trim() ? `Location: ${location}` : "Location: —";
  const html = [
    "<h2>New event alert</h2>",
    `<p><strong>${escapeHtml(eventTitle?.trim() || "Event")}</strong></p>`,
    `<p>${escapeHtml(locationLine)}</p>`,
    `<p>Severity: ${escapeHtml(severity)}</p>`,
    `<p><a href="${escapeHtml(mapLink)}">View on map</a></p>`,
  ].join("\n");

  try {
    const resend = new Resend(resendApiKey);
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: to.trim(),
      subject,
      html,
    });
    if (error) {
      console.error("Resend send failed", { to: to.trim(), error });
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend send error", { to: to.trim(), err });
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
