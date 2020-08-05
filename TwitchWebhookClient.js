const crypto = require('crypto');
const { EventEmitter } = require('events');
const https = require('https');
const querystring = require('querystring');
const url = require('url');

class TwitchWebhookClient {
	static TOPICS = [
		/**
		 * Notifies when a follows event occurs. The response mimics the Get 
		 * Users Follows endpoint.
		 */
		'users/follows',

		/**
		 * Notifies when a stream changes; e.g., stream goes online or offline, 
		 * the stream title changes, or the game changes. The response mimics 
		 * the Get Streams endpoint.
		 */
		'streams',

		/**
		 * Notifies when a user changes information about his/her profile. The 
		 * response mimics the Get Users endpoint. This web hook requires the 
		 * user:read:email OAuth scope to get notifications of email changes.
		 */
		'users',

		/**
		 * Sends a notification when a new transaction is created for an 
		 * extension. The response mimics the Get Extension Transactions 
		 * endpoint.
		 */
		'extensions/transactions',

		/**
		 * Notifies when a broadcaster adds or removes moderators.
		 */
		'moderation/moderators/events',

		/**
		 * Notifies when a broadcaster bans or un-bans people in their channel.
		 */
		'moderation/banned/events',

		/**
		 * This webhook notifies you when:
		 *  - A payment has been processed for a subscription or unsubscription.
		 *  - A user who is subscribed to a broadcaster notifies the 
		 *    broadcaster of their subscription in the chat.
		 */
		'subscriptions/events',

		/**
		 * Notifies when a hype train progression occurs; e.g., a viewer subs, 
		 * gifts, or uses Bits that kicks off or contributes towards a Hype 
		 * Train. The response mimics the Get Hype Train Event endpoint.
		 */
		'hypetrain/events',
	]

	constructor(options = {}) {
		const {
			apiBase,
			accessToken,
			clientId,
			hubBaseUrl,
			leaseSeconds,
			secret,
			serverHref,
		} = options;

		this._accessToken = accessToken;
		this._apiBase = apiBase || 'api.twitch.tv';
		this._clientId = clientId;
		this._eventEmitter = new EventEmitter();
		this._hubBaseUrl = hubBaseUrl || 'https://api.twitch.tv/helix';
		this._leaseSeconds = leaseSeconds || 864000;
		this._secret = secret || crypto.randomBytes(32).toString('hex');
		this._serverHref = serverHref || `http://localhost`;
		this._subscriptions = [];
	}

	setAccessToken(value) {
		this._accessToken = value;
	}

	post(body) {
	    return new Promise((resolve, reject) => {
	      const requestBody = JSON.stringify(body);

	      const requestOptions = {
	        hostname: this._apiBase,
	        port: 443,
	        path: '/helix/webhooks/hub',
	        method: 'POST',
	        headers: {
	        	'Client-ID': this._clientId,
	        	'Authorization': `Bearer ${this._accessToken}`,
	        	'Content-Type': 'application/json',
	        	'Content-length': requestBody.length
	        }
	      };

	      console.log(`Sending request: ${requestBody}`);

	      var req = https.request(requestOptions, (res) => {
	      	let response = '';
	      	res.on('data', data => response+=data);
	        res.on('end', () => {
	        	if (res.statusCode >= 200 && res.statusCode < 300) {
	        		const secret = res.headers['X-Hub-Signature'];
	        		//TODO: Verify secret here.

	        		return resolve();
	        	}

	        	return reject(response);
	        });
	      });

	      req.on('error', reject);
	      req.write(requestBody);
	      req.end();
	    });
	}

	subscribe(
		topic,
		data,
		webhookCallback, 
		leaseSeconds = this._leaseSeconds
	) {
		if (!this._accessToken) {
			throw new Error(`No access token set, a valid access token is ` + 
				`required!`);
		}

		if (TwitchWebhookClient.TOPICS.indexOf(topic) < 0) {
			throw new Error(`Invalid topic! Valid topics are ` + 
				`${TwitchWebhookClient.TOPICS.join('", "')}`);
		}

		let id;
		do {
			id = crypto.randomBytes(32).toString('hex');
		} while(this._subscriptions.hasOwnProperty(id));

		if (!webhookCallback) {
			webhookCallback = `${this._serverHref}/${id}`;
		}

		const hubParams = querystring.stringify(data);
		const topicUrl = `${this._hubBaseUrl}/${topic}?${hubParams}`;

		return this.post({
				'hub.callback': webhookCallback,
				'hub.lease_seconds': leaseSeconds,
				'hub.mode': 'subscribe',
				'hub.secret': this._secret,
				'hub.topic': topicUrl
			})
			.then(result => {
				this._subscriptions[id] = {
					topic,
					path: webhookCallback
				};

				return id;
			});
	}

	unsubscribe(id, data, webhookCallback) {
		if (!this._accessToken) {
			throw new Error(`No access token set, a valid access token is ` + 
				`required!`);
		}

		if (!this._subscriptions.hasOwnProperty(id)) {
			throw new Error(`No such subscription!`);
		}

		if (!webhookCallback) {
			webhookCallback = `${this._serverHref}/${id}`;
		}

		const hubParams = querystring.stringify(data);
		const topicUrl = `${this._hubBaseUrl}/${topic}?${hubParams}`;

		return this.post({
				'hub.callback': webhookCallback,
				'hub.lease_seconds': leaseSeconds,
				'hub.mode': 'unsubscribe',
				'hub.secret': this._secret,
				'hub.topic': topicUrl
			})
			.then(result => {
				this._subscriptions[id] = {
					topic,
					path: webhookCallback
				};

				return id;
			});
	}

	async getUserFromLogin(login) {
		return new Promise((resolve, reject) => {
	      const requestOptions = {
	        hostname: this._apiBase,
	        port: 443,
	        path: `/helix/users?login=${encodeURIComponent(login)}`,
	        method: 'GET',
	        headers: {
	        	'Client-ID': this._clientId,
	        	'Authorization': `Bearer ${this._accessToken}`,
	        }
	      };

	      var req = https.request(requestOptions, (res) => {
	        let response = '';
	        res.on('data', (data) => response += data);
	        res.on('end', () => resolve(JSON.parse(response)));
	      });

	      req.on('error', reject);
	      req.end();
	    });
	}

	on(event, callback) {
		this._eventEmitter.on(event, callback);
	}

	get injector() {
		return (req, res, next) => {
			const path = url.parse(req.originalUrl).pathname;
			const hasPotentialSubscriptionId = /[0-9a-f]{64}/ig.test(path);

			if (hasPotentialSubscriptionId) {
				const id = path.match(/[0-9a-f]{64}/ig)[0];

				if (this._subscriptions.hasOwnProperty(id)) {
					this._eventEmitter.emit(id, req);
					res.statusCode = 200;
					res.send();
					return;
				}
			}

			next();
		};
	}
}

module.exports = TwitchWebhookClient;