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
		size?: string; // For signature box size
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
	// Conditional logic
	enableConditionals?: boolean;
	showPersonalInfoOnlyIfEligible?: boolean;
}

interface UpdateFormConfig {
	formId: string;
	apiKey?: string;
	updateType: 'properties' | 'questions' | 'conditions';
	// For property updates
	properties?: Record<string, any>;
	// For question updates
	questionUpdates?: Array<{
		questionId: string;
		action: 'update' | 'delete' | 'add';
		questionData?: any;
		newOrder?: number;
	}>;
	// For adding new questions
	newQuestions?: Array<JotFormQuestion>;
	// For conditional updates
	conditions?: Array<{
		id?: string;
		terms: Array<{
			field: string;
			operator: string;
			value: string;
		}>;
		actions: Array<{
			field: string;
			visibility: 'Show' | 'Hide';
		}>;
		link: 'All' | 'Any';
	}>;
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
			
			case '/update-form':
				if (request.method !== 'POST') {
					return new Response('Method not allowed', { 
						status: 405,
						headers: corsHeaders 
					});
				}
				return handleUpdateForm(request, env, corsHeaders);
			
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

		// Skip page break - keep everything on same page for conditionals

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
					required: sig.required ? 'Yes' : 'No',
					size: sig.size || '600', // Wider signature box by default
					labelAlign: 'Auto',
					validation: 'None'
				});
			}
		}

		// Add captcha (invisible reCAPTCHA)
		if (config.includeCaptcha) {
			questions.push({
				type: 'control_captcha',
				text: 'Please verify that you are human',
				order: String(orderCounter++),
				name: 'captcha',
				captchaType: 'invisible', // Use invisible reCAPTCHA
				useInvisibleRecaptcha: 'Yes'
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

		// Add widgets (invisible data collectors)
		if (config.widgets) {
			for (const widget of config.widgets) {
				if (widget.type === 'userAgent') {
					questions.push({
						type: 'control_widget',
						text: '', // Empty text so it doesn't show as a field label
						order: String(orderCounter++),
						name: widget.name,
						cfname: 'Get User Agent',
						selectedField: '543ea3eb3066feaa30000036',
						static: 'No',
						hidden: 'Yes' // Hide the widget from view
					});
				} else if (widget.type === 'geoStamp') {
					questions.push({
						type: 'control_widget',
						text: '', // Empty text so it doesn't show as a field label
						order: String(orderCounter++),
						name: widget.name,
						cfname: 'Geo Stamp',
						selectedField: '5935688a725d1797050002e7',
						static: 'No',
						hidden: 'Yes' // Hide the widget from view
					});
				}
			}
		}

		// Prepare the form data for JotForm API with properties matching the original
		const formData: any = {
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

		// Add conditional logic if enabled
		if (config.enableConditionals && config.showPersonalInfoOnlyIfEligible && config.eligibilityQuestions) {
			const conditions = [];
			
			// Find question IDs for eligibility questions (they start from order 1)
			const eligibilityQuestionIds = [];
			const personalInfoQuestionIds = [];
			
			// Get eligibility question IDs (assuming they're the first questions after header)
			for (let i = 0; i < config.eligibilityQuestions.length; i++) {
				eligibilityQuestionIds.push(String(i + 2)); // +2 because header is 1, eligibility starts at 2
			}
			
			// Get personal info question IDs (they come after eligibility + first legal text, no page break)
			let personalInfoStartOrder = config.eligibilityQuestions.length + 2; // header + eligibility questions
			if (config.legalTextBlocks && config.legalTextBlocks.length > 0) {
				personalInfoStartOrder += 1; // first legal text (no page break)
			}
			
			if (config.personalInfoFields?.includeName) personalInfoQuestionIds.push(String(personalInfoStartOrder++));
			if (config.personalInfoFields?.includeAddress) personalInfoQuestionIds.push(String(personalInfoStartOrder++));
			if (config.personalInfoFields?.includeEmail) personalInfoQuestionIds.push(String(personalInfoStartOrder++));
			if (config.personalInfoFields?.includePhone) personalInfoQuestionIds.push(String(personalInfoStartOrder++));
			
			// Also include the first legal text block in the conditional
			if (config.legalTextBlocks && config.legalTextBlocks.length > 0) {
				personalInfoQuestionIds.unshift(String(config.eligibilityQuestions.length + 2)); // First legal text
			}
			
			// Create condition: Show personal info only if all eligibility questions are "Yes"
			if (personalInfoQuestionIds.length > 0) {
				const terms = eligibilityQuestionIds.map((qid, index) => ({
					id: `term_${Date.now()}_${index}`,
					field: qid,
					operator: 'equals',
					value: 'Yes',
					isError: false
				}));
				
				const actions = personalInfoQuestionIds.map((qid, index) => ({
					id: `action_${Date.now()}_${index}`,
					visibility: 'Show',
					isError: false,
					field: qid
				}));
				
				conditions.push({
					id: `condition_${Date.now()}`,
					index: '0',
					link: 'All',
					priority: '0',
					type: 'field',
					terms: JSON.stringify(terms),
					action: JSON.stringify(actions)
				});
			}
			
			if (conditions.length > 0) {
				formData.properties.conditions = conditions;
			}
		}

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

async function handleUpdateForm(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
	try {
		const config: UpdateFormConfig = await request.json();
		
		// Use API key from config if provided, otherwise use environment secret
		const apiKey = config.apiKey || env.JOTFORM_API_KEY;
		
		if (!apiKey) {
			return new Response(JSON.stringify({ error: 'API key not configured' }), {
				status: 400,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		if (!config.formId) {
			return new Response(JSON.stringify({ error: 'Form ID is required' }), {
				status: 400,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		let jotformResponse;
		
		switch (config.updateType) {
			case 'properties':
				if (!config.properties) {
					return new Response(JSON.stringify({ error: 'Properties data required for properties update' }), {
						status: 400,
						headers: { ...corsHeaders, 'Content-Type': 'application/json' }
					});
				}
				
				// Update form properties
				const formData = new FormData();
				for (const [key, value] of Object.entries(config.properties)) {
					formData.append(`properties[${key}]`, String(value));
				}
				
				jotformResponse = await fetch(`https://api.jotform.com/form/${config.formId}/properties?apiKey=${apiKey}`, {
					method: 'POST',
					body: formData
				});
				break;
				
			case 'questions':
				if (config.questionUpdates) {
					// Handle question updates/deletions first
					for (const update of config.questionUpdates) {
						if (update.action === 'delete') {
							// Delete question
							await fetch(`https://api.jotform.com/form/${config.formId}/question/${update.questionId}?apiKey=${apiKey}`, {
								method: 'DELETE'
							});
						} else if (update.action === 'update' && update.questionData) {
							// Update question
							const questionFormData = new FormData();
							for (const [key, value] of Object.entries(update.questionData)) {
								questionFormData.append(`question[${key}]`, String(value));
							}
							
							await fetch(`https://api.jotform.com/form/${config.formId}/question/${update.questionId}?apiKey=${apiKey}`, {
								method: 'POST',
								body: questionFormData
							});
						}
					}
				}
				
				// Add new questions if provided
				if (config.newQuestions && config.newQuestions.length > 0) {
					const questionsData = {
						questions: config.newQuestions.reduce((acc, question, index) => {
							acc[String(index + 1)] = question;
							return acc;
						}, {} as Record<string, any>)
					};
					
					jotformResponse = await fetch(`https://api.jotform.com/form/${config.formId}/questions?apiKey=${apiKey}`, {
						method: 'PUT',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify(questionsData)
					});
				} else {
					// Just return success for question updates/deletions
					return new Response(JSON.stringify({
						success: true,
						message: 'Questions updated successfully'
					}), {
						status: 200,
						headers: { ...corsHeaders, 'Content-Type': 'application/json' }
					});
				}
				break;
				
			case 'conditions':
				if (!config.conditions) {
					return new Response(JSON.stringify({ error: 'Conditions data required for conditions update' }), {
						status: 400,
						headers: { ...corsHeaders, 'Content-Type': 'application/json' }
					});
				}
				
				// Format conditions for JotForm API
				const formattedConditions = config.conditions.map((condition, index) => ({
					id: condition.id || `condition_${Date.now()}_${index}`,
					index: String(index),
					link: condition.link,
					priority: String(index),
					type: 'field',
					terms: JSON.stringify(condition.terms.map((term, termIndex) => ({
						id: `term_${Date.now()}_${termIndex}`,
						field: term.field,
						operator: term.operator,
						value: term.value,
						isError: false
					}))),
					action: JSON.stringify(condition.actions.map((action, actionIndex) => ({
						id: `action_${Date.now()}_${actionIndex}`,
						visibility: action.visibility,
						isError: false,
						field: action.field
					})))
				}));
				
				// Update form properties with conditions
				const conditionsFormData = new FormData();
				conditionsFormData.append('properties[conditions]', JSON.stringify(formattedConditions));
				
				jotformResponse = await fetch(`https://api.jotform.com/form/${config.formId}/properties?apiKey=${apiKey}`, {
					method: 'POST',
					body: conditionsFormData
				});
				break;
				
			default:
				return new Response(JSON.stringify({ error: 'Invalid update type. Must be: properties, questions, or conditions' }), {
					status: 400,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
		}

		if (!jotformResponse.ok) {
			const errorText = await jotformResponse.text();
			return new Response(JSON.stringify({ 
				error: 'Failed to update form',
				details: errorText 
			}), {
				status: jotformResponse.status,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		const result = await jotformResponse.json() as any;
		
		return new Response(JSON.stringify({
			success: true,
			message: `Form ${config.updateType} updated successfully`,
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
