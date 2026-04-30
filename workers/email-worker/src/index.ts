import templates from './templates';
import { EmailQueueMessage } from '../../shared/types';

export interface Env {
	BREVO_API_KEY: string;
	SMTP_FROM: string;
}

type KnownTemplate = keyof typeof templates;

function isKnownTemplate(t: string): t is KnownTemplate {
	return t in templates;
}

export default {
	async queue(batch: MessageBatch<EmailQueueMessage>, env: Env): Promise<void> {
		for (const msg of batch.messages) {
			const body = msg.body;
			console.log(`[email-worker] Processing template=${body.template} to=${body.to}`);

			try {
				// ── Template guard ──────────────────────────────────────────────────
				if (!isKnownTemplate(body.template)) {
					console.error(`[email-worker] Unknown template: ${body.template}`);
					msg.ack(); // poison pill guard
					continue;
				}

				// ── Render ──────────────────────────────────────────────────────────
				const htmlContent = templates[body.template](body.context);

				// ── Send via Brevo ──────────────────────────────────────────────────
				const res = await fetch('https://api.brevo.com/v3/smtp/email', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'api-key': env.BREVO_API_KEY,
					},
					body: JSON.stringify({
						sender: { name: 'Instalflow', email: env.SMTP_FROM },
						to: [{ email: body.to }],
						subject: body.subject,
						htmlContent,
					}),
				});

				if (!res.ok) {
					const errorText = await res.text();
					throw new Error(`Brevo error (${res.status}): ${errorText}`);
				}

				console.log(`[email-worker] ✓ Delivered template=${body.template} to=${body.to}`);
				msg.ack();
			} catch (err: any) {
				console.error(`[email-worker] ✗ Failed template=${body.template} to=${body.to}:`, err?.message ?? err);
				// Cloudflare will retry up to max_retries before dead-lettering
				msg.retry();
			}
		}
	},
};
