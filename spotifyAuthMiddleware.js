const url = require('url');
const { EventEmitter } = require('events');

const SpotifyAuth = require('./spotifyAuth');

module.exports = (options) => {
	let authorizationCode;
	let accessToken;
	let refreshToken;

	if (!options.hasOwnProperty('redirectUri')) {
		options.redirectUri = 'http://localhost/spotifyauthcallback';
	}

	const spotifyAuth = new SpotifyAuth(options);
	const eventEmitter = new EventEmitter();

	const urlParts = url.parse(options.redirectUri);
	const host = urlParts.host;
	const redirectUriPath = urlParts.pathname;

	const refreshaccessToken = () => {
		// clientId, clientSecret and refreshToken has been set on the api 
		// object previous to this call.
		spotifyAuth.refreshAccessToken().then(
			onAuthorizationCodeGrant,
			function(err) {
				console.log('Could not refresh access token', err);
			}
		);
	};

	const onAuthorizationCodeGrant = (data) => {
		if (data.hasOwnProperty('expires_in')) {
			console.log(
				`The token expires in ${data['expires_in']} seconds.`);

			let seconds;
			try {
				seconds = parseInt(data['expires_in']);
			} catch (e) {
				seconds = 3600;
			}

			seconds = Math.max(0, seconds - 60); // Give a 30s buffer
			setInterval(refreshaccessToken, seconds * 1000);
		}

		if (data.hasOwnProperty('access_token')) {
			console.log(`The Spotify access token is ` + 
				`${data['access_token']}.`);
			accessToken = data['access_token'];
			spotifyAuth.accessToken = accessToken;
		}

		if (data.hasOwnProperty('refresh_token')) {
			console.log(`The Spotify refresh token is ` + 
				`${data['refresh_token']}.`);
			refreshToken = data['refresh_token'];
			spotifyAuth.refreshToken = refreshToken;
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
						spotifyAuth.authorizationCode = authorizationCode;
						console.log(`Got Spotify authorization code: ` + 
							`${authorizationCode}`);
					}

					spotifyAuth.connect()
						.then(data => {
				         	onAuthorizationCodeGrant(data);
				         	res.redirect(`http://${host}/`);
				        })
						.catch(err => {
							console.error(err);
							res.statusCode = 500;
			          		res.send(err);
						});
				} else {
					console.log(`Spotify auth does not have credentials; ` + 
						`redirecting to Spotify OAuth flow...`);
					res.redirect(spotifyAuth.generateOauthRedirectURL());
					return;
				}
			} else {
				next();
			}
		}
	};
}