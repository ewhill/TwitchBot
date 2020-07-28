const https = require('https');
const querystring = require('querystring');

class SpotifyAuth {
  constructor(options = {}) {
    const {
        accessToken,
        authorizationCode,
        clientId,
        clientSecret,
        redirectUri,
        refreshToken,
        scope
      } = options;

    if(!clientId || !clientSecret || !redirectUri) {
      throw new Error("Missing one, some, or all required parameters.");
    }

    this._urlBase = `accounts.spotify.com`;

    this._clientId = clientId;
    this._clientSecret = clientSecret;
    this._authorizationCode = authorizationCode;
    this._redirectUri = redirectUri;
    this._accessToken = accessToken;
    this._refreshToken = refreshToken;
    this._scope = scope;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const requestBody = querystring.stringify({
          'code': this._authorizationCode,
          'grant_type': "authorization_code",
          'redirect_uri': this._redirectUri
      });

      const authorization = 
        Buffer.from(this._clientId+':'+this._clientSecret).toString('base64');

      const requestOptions = {
        hostname: this._urlBase,
        port: 443,
        path: "/api/token",
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-length': requestBody.length,
          'Authorization': `Basic ${authorization}`
        }
      };

      console.log(`Sending request: ${requestBody}`);

      var req = https.request(requestOptions, (res) => {
        let response = '';
        res.on('data', (data) => response += data);
        res.on('end', () => resolve(JSON.parse(response)));
      });

      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });
  }

  set accessToken(token) {
    this._accessToken = token;
  }

  set authorizationCode(code) {
    this._authorizationCode = code;
  }

  set refreshToken(token) {
    this._refreshToken = token;
  }

  generateOauthRedirectURL() {
    return `https://${this._urlBase}` +
        `/authorize` +
        `?response_type=code` +
        `&client_id=${this._clientId}` +
        (this._scope ? `&scope=${encodeURIComponent(this._scope)}` : ``) +
        `&redirect_uri=${encodeURIComponent(this._redirectUri)}`;
  }
};


module.exports = SpotifyAuth;