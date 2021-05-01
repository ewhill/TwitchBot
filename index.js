const express = require('express');
const fs = require('fs');
const path = require('path');
const SpotifyWebApi = require('spotify-web-api-node');
const Tmi = require('tmi.js');

const SpotifyAuthMiddleware = require('./spotifyAuthMiddleware');
const TwitchAuthMiddleware = require('./twitchAuthMiddleware');
const TwitchCountsClient = require('./twitchCountsClient');
const TwitchWebhookClient = require('./twitchWebhookClient');

const TmiClient = Tmi.client;

const app = express();
const port = 7562;

const readJsonAsync = (path) => {
	return new Promise((resolve, reject) => {
		fs.readFile(require.resolve(path), (err, data) => {
			if (err) {
				return reject(err)
	    	} else {
	    		return resolve(JSON.parse(data));
	    	}
		});
	});
};

const main = async () => {
	const settings = await readJsonAsync('./settings.json');

	const spotifyClientId = settings.spotify.app.clientId;
	const spotifyClientSecret = settings.spotify.app.secret;
	const twitchBotName = settings.twitch.bot.name || 'TehSpotBot';
	const twitchBotPassword = settings.twitch.bot.password;
	const twitchChannelName = settings.twitch.channel;
	const twitchClientId = settings.twitch.app.clientId;
	const twitchClientSecret = settings.twitch.app.secret;

	const spotifyAuthOptions = {
		clientId: spotifyClientId,
		clientSecret: spotifyClientSecret,
		redirectUri: `http://localhost:${port}/spotifyauthcallback`,
		scope: 'user-read-currently-playing user-read-playback-state'
	}

	const spotifyAuthMiddleware = SpotifyAuthMiddleware(spotifyAuthOptions);

	const twitchAuthOptions = {
		clientId: twitchClientId,
		clientSecret: twitchClientSecret,
		redirectUri: `http://localhost:${port}/twitchauthcallback`
	};

	const twitchAuthMiddleware = TwitchAuthMiddleware(twitchAuthOptions);

	const spotifyClient = new SpotifyWebApi({
		clientId: spotifyClientId,
		clientSecret: spotifyClientSecret,
	});

	const twitchClient = new TmiClient({
		identity: {
			username: twitchBotName,
			password: twitchBotPassword,
		},
		channels: [ twitchChannelName ]
	});

	await twitchClient.connect();

	
	const twitchCountsClient = new TwitchCountsClient({
		clientId: twitchClientId
	});
	const twitchWebhookClient = new TwitchWebhookClient({
		clientId: twitchClientId,
		serverHref: `http://localhost:${port}/twitchwebhooks`
	});
	

	let currentlyPlaying;
	let songPollingInterval;

	const getPlaying = async () => {
		if(!spotifyClient.getAccessToken()) {
			return Promise.reject(`Spotify client does not have prior auth!`);
		}

		let clientResponse;

		try {
			clientResponse = await spotifyClient.getMyCurrentPlayingTrack();
		} catch(err) {
			currentlyPlaying = null;
			console.error(err);
			throw err;
		}

		if (clientResponse.statusCode === 200) {
			const isNewSong = !currentlyPlaying 
				|| currentlyPlaying.body.item.id !== 
					clientResponse.body.item.id;

			if (isNewSong) {
				currentlyPlaying = clientResponse;

				let artist = clientResponse.body.item.artists
					.map(i => i.name).join(", ");
				let link = currentlyPlaying.body.item.external_urls.spotify;
				let msg = `🎶🎵🎼 Now playing ` + 
					`"${currentlyPlaying.body.item.name}" by ${artist} on ` + 
					`Spotify. Like what you hear? Take a listen on Spotify: ` + 
					`${link}`;

				console.log(`Sending Twitch message: \`${msg}\``);
				twitchClient.say(twitchChannelName, msg);
			}

			return Promise.resolve();
		} else if (clientResponse.statusCode === 204) {
			// 204 status means nothing is playing.
			currentlyPlaying = null;
			return Promise.resolve();
		}

		currentlyPlaying = null;
		console.error(clientResponse);
		throw new Error(`Unexpected response from Spotify Client!`);
	};

	spotifyAuthMiddleware.on('credentials', ({ accessToken, refreshToken }) => {
		console.log('Setting Spotify client tokens...');
		spotifyClient.setAccessToken(accessToken);
		spotifyClient.setRefreshToken(refreshToken);

		// Start polling for currently played song...
		if(songPollingInterval) {
			clearInterval(songPollingInterval)
		}
		songPollingInterval = setInterval(getPlaying, 10000);
	})
	app.use('/', spotifyAuthMiddleware.injector);

	/**
		Set up the Twitch client and included webhooks.
	*/
	twitchAuthMiddleware.on('credentials', ({ accessToken, refreshToken }) => {
		console.log('Setting Twitch client tokens...');
		twitchCountsClient.setAccessToken(accessToken);
		twitchWebhookClient.setAccessToken(accessToken);

		twitchWebhookClient.getUserFromLogin(twitchChannelName)
			.then(userInfo => {
				const userId = userInfo.data[0].id;

				if (userId) {
					return twitchWebhookClient.subscribe(
							'users/follows',
							{
								first: 1,
								to_id: userId
							});
				} else {
					Promise.reject(
						new Error('Failed to get Twitch channel id!'));
				}
			})
			.then(userFollowsSubscriptionId => {
				twitchWebhookClient.on(userFollowsSubscriptionId, (req) => {
					console.log(req);
					console.log("NEW FOLLOWER ALERT!!!");
				});

				return Promise.resolve();
			});
	})
	app.use('/', twitchAuthMiddleware.injector);

	app.use('/', twitchWebhookClient.injector);
	

	// Statically host everything in '/public'.
	app.use('/public', express.static('public'));

	// Redirect root to './player.html'.
	app.get('/', (req, res) => 
		res.sendFile(path.join(__dirname+'/player.html')));
	
	// Route for getting what's currently being played on Spotify.
	app.get('/playing', (req, res) => {
		if (!currentlyPlaying) {
			res.statusCode = 500;
			res.send();
			return;
		}
		
		res.statusCode = currentlyPlaying.statusCode;
		res.send(currentlyPlaying.body);
	});

	app.get('/counts/followers', (req, res) => {
		twitchCountsClient.getFollowers(twitchChannelName)
			.then(followersCount => {
				res.statusCode = 200;
				res.send(`${followersCount}`);
			})
			.catch(err => {
				console.error(err);
				res.statusCode = 500;
				res.send('Internal Server Error.');
			});
	});

	app.get('/counts/subscribers', (req, res) => {
		twitchCountsClient.getSubscribers(twitchChannelName)
			.then(subscribersCount => {
				res.statusCode = 200;
				res.send(`${subscribersCount}`);
			})
			.catch(err => {
				console.error(err);
				res.statusCode = 500;
				res.send('Internal Server Error.');
			});
	});

	app.listen(port, async () => {
		console.log(`SpotBot running on http://localhost:${port}`);
	});
};

main();