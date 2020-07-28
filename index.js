const express = require('express');
const fs = require('fs');
const path = require('path');
const SpotifyWebApi = require('spotify-web-api-node');
const Tmi = require('tmi.js');

const TwitchAuthMiddleware = require('./twitchAuthMiddleware');
const SpotifyAuthMiddleware = require('./spotifyAuthMiddleware');

const TmiClient = Tmi.client;

const app = express();
const port = 7562;
const twitchWebHookPort = 7563;

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

	let currentlyPlaying;

	const getPlaying = () => {
		return new Promise((resolve, reject) => {
			if(!spotifyClient.getAccessToken()) {
				return reject(`Spotify client does not have prior auth!`);
			}

			spotifyClient.getMyCurrentPlayingTrack()
				.then(data => {
					if (data.statusCode === 200) {
						const isNewSong = !currentlyPlaying 
							|| currentlyPlaying.body.item.id !==
								 data.body.item.id;

						if (isNewSong) {
							currentlyPlaying = data;
							let artist = data.body.item.artists
									.map(i => i.name).join(", ");
							let link = 
								currentlyPlaying.body.item.external_urls.spotify;
							let msg = `🎶🎵🎼 Now playing ` + 
								`"${currentlyPlaying.body.item.name}" by ` + 
								`${artist} on Spotify. Like what you hear? ` + 
								`Take a listen on Spotify: ${link}`;
							console.log(`Sending Twitch message: \`${msg}\``);
							twitchClient.say(twitchChannelName, msg);
						}
						return resolve();
					} else {
						currentlyPlaying = null;
						console.error(data);
						return reject(data);
					}
				})
				.catch(err => {
					currentlyPlaying = null;
					console.error(err);
					return reject(err);
				});
			});
	};

	spotifyAuthMiddleware.on('credentials', ({ accessToken, refreshToken }) => {
		console.log('Setting Spotify client tokens...');
		spotifyClient.setAccessToken(accessToken);
		spotifyClient.setRefreshToken(refreshToken);

		// Start polling for currently played song...
		getPlaying();
		setInterval(getPlaying, 10000);
	})
	app.use('/', spotifyAuthMiddleware.injector);

	twitchAuthMiddleware.on('credentials', ({ accessToken, refreshToken }) => {
		// TODO: Create Twitch client.
		// console.log('Setting Twitch client tokens...');
		// twitchClient.setAccessToken(accessToken);
		// twitchClient.setRefreshToken(refreshToken);
	})
	app.use('/', twitchAuthMiddleware.injector);

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

	app.listen(port, async () => {
		console.log(`SpotBot running on http://localhost:${port}`);
	});
};

main();