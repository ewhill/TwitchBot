const https = require('https');
const querystring = require('querystring');

class TwitchCountsClient {
	static COUNT_TYPES = {
		FOLLOWERS: 0,
		SUBSCRIBERS: 1
	}

	constructor(options = {}) {
		const {
			apiBase,
			accessToken,
			clientId,
			userId,
		} = options;

		this._accessToken = accessToken;
		this._apiBase = apiBase || 'api.twitch.tv';
		this._clientId = clientId;
		this._userId = userId;
	}

	setAccessToken(value) {
		this._accessToken = value;
	}

	async get(userId, type=TwitchCountsClient.COUNT_TYPES.FOLLOWERS, cursor) {
	    return new Promise((resolve, reject) => {
	      let path;
	      switch(type) {
	      	case TwitchCountsClient.COUNT_TYPES.SUBSCRIBERS:
	      		path = `/helix/subscriptions?broadcaster_id=${querystring.escape(userId)}`;
	      		break;
	      	case TwitchCountsClient.COUNT_TYPES.FOLLOWERS:
	      		path = `/helix/users/follows?to_id=${querystring.escape(userId)}`;
	      		break;
	      }

	      if(cursor) {
	      	path += `&after=${querystring.escape(cursor)}`;
	      }

	      const requestOptions = {
	        hostname: this._apiBase,
	        port: 443,
	        path,
	        headers: {
	        	'Client-ID': this._clientId,
	        	'Authorization': `Bearer ${this._accessToken}`
	        },
	        method: 'GET'
	      };

	      console.log(`Sending request: ${path}`);

	      let req = https.request(requestOptions, (res) => {
	      	let response = '';
	      	res.on('data', data => response+=data);
	        res.on('end', () => {
	        	if (res.statusCode >= 200 && res.statusCode < 300) {
	        		return resolve(JSON.parse(response));
	        	}

	        	return reject(response);
	        });
	      });

	      req.on('error', reject);
	      req.end();
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

	async getFollowers(channelName) {
		if(!this._userId) {
			const userInfo = await this.getUserFromLogin(channelName);
			this._userId = userInfo.data[0].id;
		}
		return this._getFollowers(this._userId);
	}

	async _getFollowers(userId, cursor) {
		return this.get(this._userId, TwitchCountsClient.COUNT_TYPES.FOLLOWERS, cursor)
			.then(result => {
				if(result.hasOwnProperty('pagination') && 
					result.pagination.hasOwnProperty('cursor') && 
					result.pagination.cursor && result.pagination.cursor.length > 0) {
						return this._getFollowers(userId, result.pagination.cursor)
							.then((more) => result.data.length + more);
				}
				return result.data.length;
			});
	}

	async getSubscribers(channelName) {
		if(!this._userId) {
			const userInfo = await this.getUserFromLogin(channelName);
			this._userId = userInfo.data[0].id;
		}
		return this._getSubscribers(this._userId);
	}

	async _getSubscribers(userId, cursor) {
		return this.get(userId, TwitchCountsClient.COUNT_TYPES.SUBSCRIBERS, cursor)
			.then(result => {
				if(result.hasOwnProperty('pagination') && 
					result.pagination.hasOwnProperty('cursor') && 
					result.pagination.cursor && result.pagination.cursor.length > 0) {
						return this._getSubscribers(userId, result.pagination.cursor)
							.then((more) => result.data.length + more);
				}
				return result.data.length;
			});
	}
}

module.exports = TwitchCountsClient;