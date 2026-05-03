import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class AlfaCrmApi implements ICredentialType {
	name = 'alfaCrmApi';
	displayName = 'AlfaCRM API';
	documentationUrl = 'https://alfacrm.pro/knowledge/integration/api';

	properties: INodeProperties[] = [
		{
			displayName: 'Hostname',
			name: 'hostname',
			type: 'string',
			default: '',
			placeholder: 'demo.s20.online',
			description: 'AlfaCRM cabinet hostname (without https://)',
			required: true,
		},
		{
			displayName: 'Email',
			name: 'email',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Профиль → Ключ API (v2api)',
			required: true,
		},
		{
			displayName: 'Branch ID',
			name: 'branchId',
			type: 'number',
			default: 1,
			description: 'ID активного филиала',
			required: true,
		},
	];

	// Auth flow is custom (login -> token in X-ALFACRM-TOKEN header), so we use
	// generic auth here and let the node implementation handle login + caching.
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Accept: 'application/json',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '=https://{{$credentials.hostname}}',
			url: '/v2api/auth/login',
			method: 'POST',
			body: {
				email: '={{$credentials.email}}',
				api_key: '={{$credentials.apiKey}}',
			},
			json: true,
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'token',
					value: undefined,
					message: 'Token not returned — check email/api_key',
				},
			},
		],
	};
}
