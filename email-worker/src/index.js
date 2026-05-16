import PostalMime from 'postal-mime';

// household-hub inbound-email bridge — a Cloudflare Email Worker.
//
// Cloudflare Email Routing can route a message to a Worker but cannot POST to
// an HTTP endpoint directly. This Worker receives routed mail, MIME-parses it
// with postal-mime, and forwards a clean { from, to, body } payload to
// household-hub's inbound-email webhook, authenticated with a shared-secret
// header.
//
// Deploy:  cd email-worker && npm install && npx wrangler deploy
// Secret:  npx wrangler secret put EMAIL_WEBHOOK_SECRET
//          (must match EMAIL_WEBHOOK_SECRET on the household-hub Pages project)
// Routing: in Cloudflare Email Routing, route the conversation addresses
//          (general@…, groceries@…) to this Worker.
export default {
	async email(message, env) {
		const parsed = await PostalMime.parse(message.raw);
		const body = (parsed.text || parsed.html || '').trim();

		const res = await fetch(env.WEBHOOK_URL, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-webhook-secret': env.EMAIL_WEBHOOK_SECRET || ''
			},
			body: JSON.stringify({ from: message.from, to: message.to, body })
		});

		if (!res.ok) {
			// Reject so the sender gets a bounce rather than the message
			// silently vanishing.
			message.setReject(`household-hub did not accept the message (HTTP ${res.status})`);
		}
	}
};
