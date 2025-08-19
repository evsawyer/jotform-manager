/**
 * JotForm Manager - Cloudflare Worker
 * Creates JotForms dynamically based on configuration
 */

interface Env {
	JOTFORM_API_KEY: string;
}

interface FormConfig {
	title: string;
	apiKey?: string; // Optional - will use env secret if not provided
	properties?: Record<string, any>;
	eligibilityQuestions?: Array<{
		text: string;
		name: string;
		required?: boolean;
	}>;
	personalInfoFields?: {
		includeName?: boolean;
		includeAddress?: boolean;
		includeEmail?: boolean;
		includePhone?: boolean;
	};
	legalTextBlocks?: Array<{
		content: string;
		name?: string;
	}>;
	signatureFields?: Array<{
		text: string;
		name: string;
		required?: boolean;
	}>;
	hiddenFields?: Array<{
		name: string;
		text: string;
	}>;
	widgets?: Array<{
		type: 'userAgent' | 'geoStamp';
		name: string;
		text: string;
	}>;
	includeCaptcha?: boolean;
	emailNotification?: {
		to: string;
		subject?: string;
		from?: string;
	};
}

interface JotFormQuestion {
	type: string;
	text: string;
	order: string;
	name: string;
	[key: string]: any;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		
		// Enable CORS
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		switch (url.pathname) {
			case '/create-form':
				if (request.method !== 'POST') {
					return new Response('Method not allowed', { 
						status: 405,
						headers: corsHeaders 
					});
				}
				return handleCreateForm(request, env, corsHeaders);
			
			case '/message':
				return new Response('Hello, World!', { headers: corsHeaders });
			
			case '/random':
				return new Response(crypto.randomUUID(), { headers: corsHeaders });
			
			default:
				return new Response('Not Found', { 
					status: 404,
					headers: corsHeaders 
				});
		}
	},
} satisfies ExportedHandler<Env>;

async function handleCreateForm(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
	try {
		const config: FormConfig = await request.json();
		
		// Use API key from config if provided, otherwise use environment secret
		const apiKey = config.apiKey || env.JOTFORM_API_KEY;
		
		if (!apiKey) {
			return new Response(JSON.stringify({ error: 'API key not configured' }), {
				status: 400,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		// Build questions array
		const questions: JotFormQuestion[] = [];
		let orderCounter = 1;

		// Add header
		questions.push({
			type: 'control_head',
			text: config.title || 'Form Title',
			order: String(orderCounter++),
			name: 'header'
		});

		// Add eligibility questions
		if (config.eligibilityQuestions) {
			for (const eq of config.eligibilityQuestions) {
				questions.push({
					type: 'control_radio',
					text: eq.text,
					order: String(orderCounter++),
					name: eq.name,
					required: eq.required ? 'Yes' : 'No',
					options: 'Yes|No'
				});
			}
		}

		// Add page break after eligibility questions
		if (config.eligibilityQuestions && config.eligibilityQuestions.length > 0) {
			questions.push({
				type: 'control_pagebreak',
				text: 'Page Break',
				order: String(orderCounter++),
				name: 'pageBreak1'
			});
		}

		// Add legal text before personal info
		if (config.legalTextBlocks) {
			for (let i = 0; i < config.legalTextBlocks.length; i++) {
				const block = config.legalTextBlocks[i];
				if (i === 0) { // First legal block typically goes before personal info
					questions.push({
						type: 'control_text',
						text: block.content,
						order: String(orderCounter++),
						name: block.name || `legalText${i}`
					});
				}
			}
		}

		// Add personal info fields
		if (config.personalInfoFields) {
			if (config.personalInfoFields.includeName) {
				questions.push({
					type: 'control_fullname',
					text: 'Name *',
					order: String(orderCounter++),
					name: 'name',
					required: 'Yes',
					labelAlign: 'Auto',
					validation: 'None',
					sublabels: JSON.stringify({
						prefix: 'Prefix',
						first: 'First Name',
						middle: 'Middle Name',
						last: 'Last Name',
						suffix: 'Suffix'
					}),
					size: '20',
					readonly: 'No'
				});
			}

			if (config.personalInfoFields.includeAddress) {
				questions.push({
					type: 'control_address',
					text: 'Address *',
					order: String(orderCounter++),
					name: 'address',
					required: 'Yes',
					labelAlign: 'Auto',
					validation: 'None',
					sublabels: JSON.stringify({
						addr_line1: 'Street Address',
						addr_line2: 'Street Address Line 2',
						city: 'City',
						state: 'State',
						postal: 'Zip Code',
						country: 'Country'
					}),
					size: '20',
					readonly: 'No'
				});
			}

			if (config.personalInfoFields.includeEmail) {
				questions.push({
					type: 'control_email',
					text: 'Email *',
					order: String(orderCounter++),
					name: 'email',
					required: 'Yes',
					labelAlign: 'Auto',
					validation: 'Email',
					size: '20',
					readonly: 'No'
				});
			}

			if (config.personalInfoFields.includePhone) {
				questions.push({
					type: 'control_phone',
					text: 'Phone Number *',
					order: String(orderCounter++),
					name: 'phoneNumber',
					required: 'Yes',
					labelAlign: 'Auto',
					validation: 'None',
					countryCode: 'No',
					inputMask: 'enable',
					inputMaskValue: '(###) ###-####',
					size: '20',
					readonly: 'No',
					sublabels: JSON.stringify({
						country: 'Country Code',
						area: 'Area Code',
						phone: 'Phone Number',
						full: 'Phone Number',
						masked: 'Please enter a valid phone number.'
					})
				});
			}
		}

		// Add page break before signature section
		questions.push({
			type: 'control_pagebreak',
			text: 'Page Break',
			order: String(orderCounter++),
			name: 'pageBreak2'
		});

		// Add remaining legal text blocks
		if (config.legalTextBlocks) {
			for (let i = 1; i < config.legalTextBlocks.length; i++) {
				const block = config.legalTextBlocks[i];
				questions.push({
					type: 'control_text',
					text: block.content,
					order: String(orderCounter++),
					name: block.name || `legalText${i}`
				});
			}
		}

		// Add signature fields
		if (config.signatureFields) {
			for (const sig of config.signatureFields) {
				questions.push({
					type: 'control_signature',
					text: sig.text,
					order: String(orderCounter++),
					name: sig.name,
					required: sig.required ? 'Yes' : 'No'
				});
			}
		}

		// Add captcha
		if (config.includeCaptcha) {
			questions.push({
				type: 'control_captcha',
				text: 'Please verify that you are human',
				order: String(orderCounter++),
				name: 'captcha'
			});
		}

		// Add submit button
		questions.push({
			type: 'control_button',
			text: 'Submit',
			order: String(orderCounter++),
			name: 'submit'
		});

		// Add hidden fields at the beginning with proper order
		if (config.hiddenFields) {
			for (const field of config.hiddenFields) {
				questions.unshift({
					type: 'control_textbox',
					text: field.text,
					order: String(config.hiddenFields.indexOf(field) + 1),
					name: field.name,
					hidden: 'Yes',
					labelAlign: 'Auto',
					validation: 'None',
					size: '20',
					required: 'No',
					readonly: 'No'
				});
			}
			// Reorder all other questions
			for (let i = config.hiddenFields.length; i < questions.length; i++) {
				questions[i].order = String(i + 1);
			}
		}

		// Add widgets
		if (config.widgets) {
			for (const widget of config.widgets) {
				if (widget.type === 'userAgent') {
					questions.push({
						type: 'control_widget',
						text: widget.text,
						order: String(orderCounter++),
						name: widget.name,
						cfname: 'Get User Agent',
						selectedField: '543ea3eb3066feaa30000036',
						static: 'No'
					});
				} else if (widget.type === 'geoStamp') {
					questions.push({
						type: 'control_widget',
						text: widget.text,
						order: String(orderCounter++),
						name: widget.name,
						cfname: 'Geo Stamp',
						selectedField: '5935688a725d1797050002e7',
						static: 'No'
					});
				}
			}
		}

		// Prepare the form data for JotForm API with properties matching the original
		const formData = {
			properties: {
				title: config.title || 'New Form',
				height: '600',
				formWidth: '752',
				labelWidth: '230',
				font: 'Inter',
				fontsize: '14',
				fontcolor: '#121212',
				background: 'rgba(255,255,255,0)',
				pageColor: '#F3F3FE',
				alignment: 'Top',
				lineSpacing: '4',
				styles: 'nova',
				themeID: '5e6b428acc8c4e222d1beb91',
				showProgressBar: 'disable',
				errorNavigation: 'Yes',
				highlightLine: 'Enabled',
				responsive: 'No',
				...config.properties
			},
			questions: questions,
			emails: [] as Array<{
				type: string;
				name: string;
				from: string;
				to: string;
				subject: string;
				html: string;
			}>
		};

		// Add email notification if configured
		if (config.emailNotification) {
			formData.emails.push({
				type: 'notification',
				name: 'notification',
				from: config.emailNotification.from || 'default',
				to: config.emailNotification.to,
				subject: config.emailNotification.subject || 'New Form Submission',
				html: 'true'
			});
		}

		// Make API call to JotForm
		const jotformResponse = await fetch(`https://api.jotform.com/form?apiKey=${apiKey}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(formData)
		});

		if (!jotformResponse.ok) {
			const errorText = await jotformResponse.text();
			return new Response(JSON.stringify({ 
				error: 'Failed to create form',
				details: errorText 
			}), {
				status: jotformResponse.status,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		const result = await jotformResponse.json() as any;
		
		return new Response(JSON.stringify({
			success: true,
			formId: result.content?.id,
			formUrl: result.content?.url,
			data: result
		}), {
			status: 200,
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});

	} catch (error) {
		return new Response(JSON.stringify({ 
			error: 'Internal server error',
			message: error instanceof Error ? error.message : 'Unknown error'
		}), {
			status: 500,
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	}
}
