const SpotifyWebApi = require('spotify-web-api-node');

let isRunning = false;
let intervalId = null;
let credentials = null;
let spotifyClient = null;
let notPlaying = "Spotify";
let currentPlaying = notPlaying;

async function getCredentials() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['spotifyClientId', 'spotifyClientSecret'], (result) => {
            resolve(result);
        });
    });
}

async function initialize() {
    credentials = await getCredentials();
    if (!credentials.spotifyClientId || !credentials.spotifyClientSecret) {
        throw new Error('Credentials not complete');
    }
    spotifyClient = await initSpotifyClient(credentials.spotifyClientId, credentials.spotifyClientSecret);
}

async function initSpotifyClient(clientId, clientSecret) {
    const redirectUri = chrome.identity.getRedirectURL('spotify');
    const newSpotifyApi = new SpotifyWebApi({ clientId, clientSecret, redirectUri });
    const tokens = await chrome.storage.local.get(['access_token', 'refresh_token', 'expires_in']);
    
    if (tokens.access_token && tokens.refresh_token) {
        if ((Date.now() - tokens.token_timestamp) >= (tokens.expires_in * 1000)) {
            await refreshAccessToken(newSpotifyApi);
        } else {
            newSpotifyApi.setAccessToken(tokens.access_token);
            newSpotifyApi.setRefreshToken(tokens.refresh_token);
        }
        setTokenRefreshInterval(newSpotifyApi, tokens.expires_in);
    } else {
        await authorizeSpotify(newSpotifyApi);
    }
    
    return newSpotifyApi;
}

async function authorizeSpotify(spotifyApi) {
    const scopes = ['user-read-currently-playing', 'user-read-playback-state'];
    const authUrl = 'https://accounts.spotify.com/authorize' +
        '?response_type=code' +
        '&client_id=' + credentials.spotifyClientId +
        '&scope=' + encodeURIComponent(scopes.join(' ')) +
        '&redirect_uri=' + encodeURIComponent(chrome.identity.getRedirectURL('spotify')) +
        '&state=state';
    
    try {
        const redirectURL = await chrome.identity.launchWebAuthFlow({
            url: authUrl,
            interactive: true
        });
        
        const code = new URLSearchParams(new URL(redirectURL).search).get('code');
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(credentials.spotifyClientId + ':' + credentials.spotifyClientSecret)
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: chrome.identity.getRedirectURL('spotify')
            })
        });

        if (!tokenResponse.ok) {
            throw new Error('Failed to get access token');
        }

        const data = await tokenResponse.json();
        const { access_token, refresh_token, expires_in } = data;
        
        spotifyApi.setAccessToken(access_token);
        spotifyApi.setRefreshToken(refresh_token);
        
        await chrome.storage.local.set({ 
            access_token, 
            refresh_token, 
            expires_in,
            token_timestamp: Date.now()
        });

        setTokenRefreshInterval(spotifyApi, expires_in);
        
    } catch (error) {
        throw error;
    }
}

async function refreshAccessToken(spotifyApi) {
    const refresh_token = spotifyApi.getRefreshToken();
    
    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(credentials.spotifyClientId + ':' + credentials.spotifyClientSecret)
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token
            })
        });

        if (!response.ok) {
            throw new Error('Failed to refresh token');
        }

        const data = await response.json();
        const { access_token } = data;
        
        spotifyApi.setAccessToken(access_token);
        
        await chrome.storage.local.set({ 
            access_token,
            token_timestamp: Date.now()
        });

        return data;
    } catch (error) {
        throw error;
    }
}

function setTokenRefreshInterval(spotifyApi, expires_in) {
    const refreshTime = (expires_in - 300) * 1000;
    
    setInterval(async () => {
        try {
            await refreshAccessToken(spotifyApi);
        } catch (error) {}
    }, refreshTime);
}

async function runLoop() {
    const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + spotifyClient.getAccessToken()
        }
    });

    if(response.status === 204){
        if (currentPlaying !== notPlaying) {
            await updateSteamStatus("Spotify");
            currentPlaying = notPlaying;
        }
        return;
    }

    if(response.status === 401){
        await refreshAccessToken(spotifyClient);
        return;
    }

    if (!response.ok) {
        return;
    }

    const currentlyPlaying = await response.json();
    
    if (currentlyPlaying.is_playing && currentlyPlaying.item) {
        const track = currentlyPlaying.item;
        const songId = track.id;
        if (songId !== currentPlaying) {
            const playing = `${track.name} • ${track.artists.map(({ name }) => name).join(", ")}`;
            await updateSteamStatus(playing);
            currentPlaying = songId;
        }
    } else {
        if (currentPlaying !== notPlaying) {
            await updateSteamStatus("Spotify");
            currentPlaying = notPlaying;
        }
    }
}

async function updateSteamStatus(playing) {
    const apiUrl = `https://your-api-endpoint/?game=${playing}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'GET'
        });

        if (!response.ok) {
            throw new Error('Failed to update Steam status');
        }
    } catch (error) {}
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getStatus') {
        sendResponse({ isRunning });
        return false;
    }
    else if (request.action === 'start') {
        if (!isRunning) {
            isRunning = true;
            initialize()
                .then(() => {
                    intervalId = setInterval(runLoop, 10000);
                    sendResponse({ success: true });
                })
                .catch((error) => {
                    isRunning = false;
                    sendResponse({ 
                        success: false, 
                        error: error.message || 'Initialization failed'
                    });
                });
            return true;
        } else {
            sendResponse({ success: true });
            return false;
        }
    } 
    else if (request.action === 'stop') {
        if (isRunning) {
            isRunning = false;
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
            credentials = null;
            sendResponse({ success: true });
        } else {
            sendResponse({ success: true });
        }
        return false;
    }
    return false;
});