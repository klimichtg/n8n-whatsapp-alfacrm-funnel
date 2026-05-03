import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
	IDataObject,
	NodeApiError,
} from 'n8n-workflow';

/**
 * AlfaCRM community node.
 *
 * Wraps the REST API v2 with:
 *   - per-credential token caching (1h TTL minus 100s safety buffer)
 *   - automatic retry on 401 (token expired -> re-login -> retry once)
 *   - exponential backoff on 5xx (3 attempts: 1s -> 2s -> 4s)
 *   - 5 req/sec local rate limiter (token bucket in node memory)
 *
 * Resources covered: customer, lesson, branch, lead-source.
 * Operations: list (index), get, create, update, delete.
 */
export class AlfaCRM implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AlfaCRM',
		name: 'alfaCRM',
		icon: 'file:alfacrm.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'AlfaCRM REST API v2 wrapper with token caching, retry and rate-limit',
		defaults: { name: 'AlfaCRM' },
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [{ name: 'alfaCrmApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Customer', value: 'customer' },
					{ name: 'Lesson', value: 'lesson' },
					{ name: 'Branch', value: 'branch' },
					{ name: 'Lead Source', value: 'leadSource' },
				],
				default: 'customer',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'List', value: 'list', action: 'List items with filters' },
					{ name: 'Get', value: 'get', action: 'Get a single item by ID' },
					{ name: 'Create', value: 'create', action: 'Create an item' },
					{ name: 'Update', value: 'update', action: 'Update an item' },
					{ name: 'Delete', value: 'delete', action: 'Delete an item' },
				],
				default: 'list',
			},
			{
				displayName: 'Item ID',
				name: 'itemId',
				type: 'number',
				default: 0,
				required: true,
				displayOptions: { show: { operation: ['get', 'update', 'delete'] } },
			},
			{
				displayName: 'Body (JSON)',
				name: 'body',
				type: 'json',
				default: '{}',
				description: 'Request body. See AlfaCRM docs for fields per resource.',
				displayOptions: { show: { operation: ['list', 'create', 'update'] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];

		const creds = await this.getCredentials('alfaCrmApi');
		const hostname = creds.hostname as string;
		const branchId = creds.branchId as number;

		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as string;
			const operation = this.getNodeParameter('operation', i) as string;

			const path = buildPath(resource, operation, branchId, i, this);
			const method = operation === 'list' || operation === 'create' || operation === 'update'
				? 'POST'
				: 'POST';

			const body =
				operation === 'list' || operation === 'create' || operation === 'update'
					? (this.getNodeParameter('body', i, {}) as IDataObject)
					: {};

			const response = await callWithRetry.call(this, hostname, path, method, body, creds);
			out.push({ json: response as IDataObject, pairedItem: { item: i } });
		}

		return [out];
	}
}

// --- helpers ------------------------------------------------------------

function buildPath(
	resource: string,
	operation: string,
	branchId: number,
	itemIndex: number,
	ctx: IExecuteFunctions,
): string {
	const resourcePath: Record<string, string> = {
		customer: 'customer',
		lesson: 'lesson',
		branch: 'branch',
		leadSource: 'lead-source',
	};

	const r = resourcePath[resource];
	const branchPrefix = resource === 'branch' ? '' : `/${branchId}`;

	switch (operation) {
		case 'list':
			return `/v2api${branchPrefix}/${r}/index`;
		case 'create':
			return `/v2api${branchPrefix}/${r}/create`;
		case 'update': {
			const id = ctx.getNodeParameter('itemId', itemIndex);
			return `/v2api${branchPrefix}/${r}/update?id=${id}`;
		}
		case 'delete': {
			const id = ctx.getNodeParameter('itemId', itemIndex);
			return `/v2api${branchPrefix}/${r}/delete?id=${id}`;
		}
		case 'get': {
			const id = ctx.getNodeParameter('itemId', itemIndex);
			return `/v2api${branchPrefix}/${r}/index?id=${id}`;
		}
	}
	throw new Error(`Unsupported operation ${operation}`);
}

// In-memory token cache + simple rate limiter.
const tokenCache = new Map<string, { token: string; exp: number }>();
let lastCallAt = 0;
const MIN_INTERVAL_MS = 200; // 5 req/sec hard limit from AlfaCRM

async function getToken(this: IExecuteFunctions, hostname: string, creds: IDataObject): Promise<string> {
	const cacheKey = `${hostname}:${creds.email}`;
	const cached = tokenCache.get(cacheKey);
	if (cached && cached.exp > Date.now()) return cached.token;

	const body = { email: creds.email, api_key: creds.apiKey };
	const res = (await this.helpers.httpRequest({
		method: 'POST',
		url: `https://${hostname}/v2api/auth/login`,
		headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		body,
		json: true,
	})) as { token?: string };

	if (!res.token) throw new NodeApiError(this.getNode(), res as IDataObject, { message: 'Auth failed' });

	tokenCache.set(cacheKey, { token: res.token, exp: Date.now() + 3500 * 1000 });
	return res.token;
}

async function callWithRetry(
	this: IExecuteFunctions,
	hostname: string,
	path: string,
	method: string,
	body: IDataObject,
	creds: IDataObject,
): Promise<unknown> {
	// Rate limit
	const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - Date.now());
	if (wait > 0) await new Promise((r) => setTimeout(r, wait));
	lastCallAt = Date.now();

	const attempt = async (token: string) =>
		this.helpers.httpRequest({
			method: method as 'POST',
			url: `https://${hostname}${path}`,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				'X-ALFACRM-TOKEN': token,
			},
			body,
			json: true,
		});

	let token = await getToken.call(this, hostname, creds);

	for (let backoff of [0, 1000, 2000, 4000]) {
		if (backoff > 0) await new Promise((r) => setTimeout(r, backoff));
		try {
			return await attempt(token);
		} catch (err: unknown) {
			const status = (err as { response?: { status?: number } }).response?.status;
			if (status === 401) {
				// Token invalid — invalidate cache, re-login, retry once
				tokenCache.delete(`${hostname}:${creds.email}`);
				token = await getToken.call(this, hostname, creds);
				continue;
			}
			if (status && status >= 500) continue; // retry on 5xx
			throw err;
		}
	}
	throw new NodeApiError(this.getNode(), { message: 'Exceeded retry attempts' });
}
