const https = require('https');

class TwitchAuth {
  constructor(options = {}) {
    const {
        accessToken,
        authorizationCode,
        clientId,
        clientSecret,
        redirectUri,
        refreshToken
      } = options;

    if(!clientId || !clientSecret || !redirectUri) {
      throw new Error("Missing one, some, or all required parameters.");
    }

    this._twitchIdBase = `id.twitch.tv`;

    this._clientId = clientId;
    this._clientSecret = clientSecret;
    this._authorizationCode = authorizationCode;
    this._redirectUri = redirectUri;
    this._accessToken = accessToken;
    this._refreshToken = refreshToken;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const requestBody = JSON.stringify({
          'client_id': this._clientId,
          'client_secret': this._clientSecret,
          'code': this._authorizationCode,
          'grant_type': "authorization_code",
          'redirect_uri': this._redirectUri
      });

      const requestOptions = {
        hostname: this._twitchIdBase,
        port: 443,
        path: "/oauth2/token",
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-length': requestBody.length
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
    return `https://${this._twitchIdBase}` + 
      `/oauth2/authorize?` + 
      `client_id=${encodeURIComponent(this._clientId)}` + 
      `&redirect_uri=${encodeURIComponent(this._redirectUri)}` + 
      `&response_type=code` + 
      `&scope=channel:read:subscriptions`;
  }
};


module.exports = TwitchAuth;