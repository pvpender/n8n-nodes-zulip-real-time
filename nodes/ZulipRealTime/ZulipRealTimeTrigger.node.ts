import { INodeType, INodeTypeDescription, ITriggerResponse, ITriggerFunctions } from 'n8n-workflow';

export class ZulipRealTimeTrigger implements INodeType {
	description: INodeTypeDescription = {
		version: 1,
		defaults: {
			name: 'Zulip Trigger',
		},
		inputs: [],
		outputs: ['main'],
		displayName: 'Zulip Real Time (like LongPoll) Trigger',
		name: 'zulipRealTimeTrigger',
		group: ['trigger'],
		description: 'Zulip trigger for real time API',
		icon: 'file:zulip.svg',
		credentials: [
			{
				name: 'zulipApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Updates',
				name: 'updates',
				type: 'multiOptions',
				options: [
					{
						name: 'Message',
						value: 'message',
						description: 'New messages'
					}
				],
				required: true,
				default: [],
				description: 'The update types to listen to',
			},
			{
				displayName: 'Timeout',
				name: 'timeout',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 3,
				description: 'Timeout (in seconds) for the polling request',
			},
			{
				displayName: 'Nonblock',
				name: 'nonblock',
				type: 'boolean',
				default: true,
				description: 'Whether false - the request will block until either a new event is available or a few minutes have passed'
			},
		],
	};
	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const credentials = await this.getCredentials('zulipApi');
		let allowedUpdates = await this.getNodeParameter('updates');
		const timeout = await this.getNodeParameter('timeout') as number;
		const blokingType = await this.getNodeParameter('nonblock') as boolean;
		let isPolling = true;
		const abortController = new AbortController();
		const startPolling = async() => {
			let lastId = -1;
			const registerResponse = (await this.helpers.request({
				method: 'POST',
				uri: `${credentials.url}api/v1/register`,
				auth: {
					user: String(credentials.email),
					password: String(credentials.apiKey),
				},
				json: true,
				timeout: 0,
				qs: {
					event_types: JSON.stringify(allowedUpdates)
				},
				useQuerystring: true
			}));
			while (isPolling){
				try{
					const response = (await this.helpers.request({
						method: 'GET',
						uri: `${credentials.url}api/v1/events`,
						auth: {
							user: String(credentials.email),
							password: String(credentials.apiKey),
						},
						json: true,
						timeout: 0,
						qs: {
							queue_id: registerResponse.queue_id,
							last_event_id: lastId,
							dont_block: blokingType,
						},
						useQuerystring: true
					}));
					if (response.events.length === 0) {
						await (new Promise(resolve => setTimeout(resolve, timeout * 1000)));
						continue;
					} else {
						lastId += response.events.length;
						this.emit([this.helpers.returnJsonArray(response.events)]);
					}
				} catch (error) {
					if (error.response?.status === 409 && !isPolling) {
						console.debug('error 409, ignoring because execution is on final cleanup...');
						continue;
					}
					// Добавить обработку AxiousError 400, иначе будет плохо
					throw error;
				}
			}
		} ;
		startPolling();

		const closeFunction = async () => {
			isPolling = false;
			abortController.abort();
		};

		return {
			closeFunction,
		};
	}
}
