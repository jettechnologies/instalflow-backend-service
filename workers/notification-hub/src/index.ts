import { EventRouter } from './router/event.router';
import { DomainEvent } from './event.types';
import { NotificationChannel, EmailQueueMessage, SmsQueueMessage } from '../../shared/types';

export interface Env {
	WORKER_SECRET: string;
	email_queue: Queue<EmailQueueMessage>;
	sms_queue: Queue<SmsQueueMessage>;
}

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		if (req.method !== 'POST') {
			return json({ error: 'Method Not Allowed' }, 405);
		}

		const secret = req.headers.get('X-Worker-Secret');
		if (!secret || secret !== env.WORKER_SECRET) {
			return json({ error: 'Unauthorized' }, 401);
		}

		let body: { event: DomainEvent; payload: Record<string, any> };
		try {
			body = await req.json();
		} catch {
			return json({ error: 'Invalid JSON' }, 400);
		}

		const { event, payload } = body;

		if (!event || !payload) {
			return json({ error: 'Missing `event` or `payload`' }, 400);
		}

		const rules = EventRouter[event as DomainEvent];
		if (!rules || rules.length === 0) {
			console.log(`[hub] No rules for event: ${event} — skipping`);
			return json({ skipped: true, event });
		}

		const dispatched: string[] = [];
		const errors: string[] = [];

		for (const rule of rules) {
			const resolvedContext = typeof rule.context === 'function' ? rule.context(payload) : rule.context;

			const resolvedSubject = typeof rule.subject === 'function' ? rule.subject(payload) : rule.subject;

			for (const channel of rule.channels) {
				try {
					if (channel === NotificationChannel.EMAIL) {
						const msg: EmailQueueMessage = {
							to: payload.email,
							subject: resolvedSubject,
							template: rule.template,
							context: resolvedContext,
						};

						await env.email_queue.send(msg);
						dispatched.push(`email:${rule.template}`);
						console.log(`[hub] → email_queue  template=${rule.template} to=${payload.email}`);
					}

					if (channel === NotificationChannel.SMS) {
						// `phone` resolver is defined per-rule in EventRouter
						const phone = rule.phone ? rule.phone(payload) : payload.phone;

						if (!phone) {
							console.warn(`[hub] SMS rule for ${event} has no resolvable phone number — skipping`);
							continue;
						}

						const msg: SmsQueueMessage = {
							to: phone,
							// SMS body lives in context.message (set by the router rule)
							message: resolvedContext.message ?? '',
						};

						await env.sms_queue.send(msg);
						dispatched.push(`sms:${rule.template}`);
						console.log(`[hub] → sms_queue  to=${phone}`);
					}
				} catch (err: any) {
					const detail = `${channel}:${rule.template} — ${err?.message ?? err}`;
					console.error(`[hub] Dispatch error: ${detail}`);
					errors.push(detail);
				}
			}
		}

		if (errors.length > 0 && dispatched.length === 0) {
			return json({ success: false, errors }, 500);
		}

		return json({ success: true, dispatched, errors: errors.length ? errors : undefined });
	},
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}
