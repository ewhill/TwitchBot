const url = require('url');
const { EventEmitter } = require('events');

const TwitchAuth = require('./twitchAuth');

module.exports = (options) => {
	let authorizationCode;
	let accessToken;
	let refreshToken;

	if (!options.hasOwnProperty('redirectUri')) {
		options.redirectUri = 'http://localhost/twitchauthcallback';
	}

	const twitchAuth = new TwitchAuth(options);
	const eventEmitter = new EventEmitter();

	const urlParts = url.parse(options.redirectUri);
	const host = urlParts.host;
	const redirectUriPath = urlParts.pathname;

	const refreshaccessToken = () => {
		// clientId, clientSecret and refreshToken has been set on the api 
		// object previous to this call.
		console.log(`Attempting to refresh token...`);
		twitchAuth.refreshAccessToken().then(
			onauthorizationCodeGrant,
			function(err) {
				console.log('Could not refresh access token', err);
			}
		);
	};


	const onauthorizationCodeGrant = (data) => {
		if (data.hasOwnProperty('expires_in')) {
			console.log(
				`The token expires in ${data['expires_in']} seconds.`);

			let seconds;
			try {
				seconds = parseInt(data['expires_in']);
			} catch (e) {
				seconds = 3600;
			}

			// Give a 2m buffer (if possible, else 30 seconds default)
			seconds = Math.max(30, seconds - 120);
			setInterval(refreshaccessToken, seconds * 1000);
		}

		if (data.hasOwnProperty('access_token')) {
			console.log(`The Twitch access token is ` + 
				`${data['access_token']}.`);
			accessToken = data['access_token'];
			twitchAuth.accessToken = accessToken;
		}

		if (data.hasOwnProperty('refresh_token')) {
			console.log(`The Twitch refresh token is ` + 
				`${data['refresh_token']}.`);
			refreshToken = data['refresh_token'];
			twitchAuth.refreshToken = refreshToken;
		}

		eventEmitter.emit('credentials', ({ accessToken, refreshToken }))
	};

	return {
		getAccessToken: () => accessToken,
		getRefreshToken: () => refreshToken,
		on: (e, f) => eventEmitter.on(e, f),
		injector: (req, res, next) => {
			const path = url.parse(req.originalUrl).pathname;

			if (!accessToken || !refreshToken) {
				if (path === redirectUriPath) {
					if (authorizationCode == null) {
						authorizationCode = req.query.code;
						twitchAuth.authorizationCode = authorizationCode;
						console.log(`Got Twitch authorization code: ` + 
							`${authorizationCode}`);
					}

					twitchAuth.connect()
						.then(authResponse => {
							if (authResponse.hasOwnProperty('status') && 
								authResponse.status !== 200) {
									res.statusCode = authResponse.status;
									res.send(authResponse);
							} else {
								onauthorizationCodeGrant(authResponse);
								res.redirect(`http://${host}/`);
							}
						})
						.catch(err => {
							console.error(err);
							res.statusCode = 500;
							res.send(err);
						});
				} else {
					console.log(`Twitch auth does not have credentials; ` + 
						`redirecting to twith OAuth flow...`);
					res.redirect(twitchAuth.generateOauthRedirectURL());
					return;
				}
			} else {
				next();
			}
		}
	};
}