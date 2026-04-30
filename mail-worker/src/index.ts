import templates from './templates';

export interface Env {
	BREVO_API_KEY: string;
	SMTP_FROM: string;
	WORKER_SECRET: string;
	mail_queue: Queue<EmailRequest>;
}

interface EmailRequest {
	to: string;
	subject: string;
	template: keyof typeof templates;
	context: Record<string, any>;
}

// using producers and consumers within the worker service

export default {
	async fetch(request: Request, env: Env) {
		if (request.method !== 'POST') {
			return new Response('Method Not Allowed', { status: 405 });
		}

		const secret = request.headers.get('X-Worker-Secret');

		if (!secret || secret !== env.WORKER_SECRET) {
			return new Response('Unauthorized', { status: 401 });
		}

		try {
			const body: EmailRequest = await request.json();

			if (!templates[body.template]) {
				return new Response(JSON.stringify({ success: false, error: 'Invalid template' }), {
					status: 400,
				});
			}

			await env.mail_queue.send(body);

			return new Response(JSON.stringify({ success: true, queued: true }), {
				status: 200,
			});
		} catch (err: any) {
			console.error('Queue producer failed:', err);
			return new Response(JSON.stringify({ success: false, error: err.message }), {
				status: 500,
			});
		}
	},

	async queue(batch: MessageBatch<EmailRequest>, env: Env, ctx: ExecutionContext) {
		for (const msg of batch.messages) {
			try {
				const body = msg.body;

				if (!templates[body.template]) {
					msg.ack();
					continue;
				}

				const htmlContent = templates[body.template](body.context);

				const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
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

				if (!brevoResponse.ok) {
					const errorText = await brevoResponse.text();
					throw new Error(errorText);
				}

				msg.ack();
			} catch (err) {
				console.error('Email processing failed:', err);
				msg.retry();
			}
		}
	},
};

// export default {
// 	async fetch(request: Request, env: Env) {
// 		if (request.method !== 'POST') {
// 			return new Response('Method Not Allowed', { status: 405 });
// 		}

// 		try {
// 			const body: EmailRequest = await request.json();

// 			// ✅ Validate template exists
// 			if (!templates[body.template]) {
// 				return new Response(JSON.stringify({ success: false, error: 'Invalid template' }), { status: 400 });
// 			}

// 			// ✅ Render precompiled template (SAFE)
// 			const htmlContent = templates[body.template](body.context);

// 			// ✅ Send to Brevo
// 			const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
// 				method: 'POST',
// 				headers: {
// 					'Content-Type': 'application/json',
// 					'api-key': env.BREVO_API_KEY,
// 				},
// 				body: JSON.stringify({
// 					sender: {
// 						name: 'Shopery',
// 						email: env.SMTP_FROM,
// 					},
// 					to: [{ email: body.to }],
// 					subject: body.subject,
// 					htmlContent,
// 				}),
// 			});

// 			if (!brevoResponse.ok) {
// 				const errorText = await brevoResponse.text();
// 				throw new Error(errorText);
// 			}

// 			return new Response(JSON.stringify({ success: true }), {
// 				status: 200,
// 			});
// 		} catch (err: any) {
// 			console.error('Email worker failed:', err);
// 			return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
// 		}
// 	},
// };
