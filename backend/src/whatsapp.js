/* WhatsApp order-confirmation via Meta's official WhatsApp Business Cloud
   API — never an unofficial WhatsApp Web automation library. Each restaurant
   uses its own Meta phone number + access token (set in Settings), so this
   never touches WhatsApp on our behalf, and one tenant's messages can never
   be sent through another tenant's number.

   Business-initiated messages outside the 24h customer-service window must
   use a pre-approved template ("Utility" category) — free-form text isn't
   allowed. The template name/language are configurable per tenant since
   template approval happens in the restaurant's own Meta Business Manager. */

const GRAPH_VERSION = "v20.0";

export function whatsappConfigured(tenant) {
  return !!(tenant.whatsapp_enabled && tenant.whatsapp_phone_number_id && tenant.whatsapp_access_token);
}

/* Sends the order-confirmation template with two placeholders: {{1}} = order
   code, {{2}} = total. Fire-and-forget from the caller's point of view —
   failures are logged, never thrown, so a WhatsApp outage can't block an
   order status update. */
export async function sendOrderWhatsApp(tenant, order) {
  if (!whatsappConfigured(tenant)) return;
  const to = String(order.phone || "").replace(/\D/g, "");
  if (to.length < 8) return; // no usable phone on this order

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${tenant.whatsapp_phone_number_id}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: tenant.whatsapp_template_name || "order_confirmation",
      language: { code: tenant.whatsapp_template_lang || "en_US" },
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: String(order.code || "") },
          { type: "text", text: `₹${Number(order.total || 0).toFixed(0)}` },
        ],
      }],
    },
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tenant.whatsapp_access_token}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      console.error(`[whatsapp] send failed for tenant ${tenant.slug}:`, data.error?.message || resp.status);
    }
  } catch (e) {
    console.error(`[whatsapp] send error for tenant ${tenant.slug}:`, e.message);
  }
}
