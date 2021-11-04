const path = require("path");
const fs = require("fs");
const winax = require("winax");
const playlistRegex = /’/;

var interval = setInterval(function () {
  winax.peekAndDispatchMessages(); // allows ActiveX event to be dispatched
}, 50);
const TPClient = new (require("touchportal-api").Client)();

const iTunes = new winax.Object("iTunes.Application");

const LIBRARY_TYPE = 1;

const pluginId = "TPiTunes";

let heldAction = {};
let pluginSettings = {};

let iTunesLibrary = undefined;
let iTunesStates = {
  PlayerState: { id: "itunes_playing_state", value: "" },
  Volume: { id: "itunes_volume", value: "" },
  CurrentTrackAlbum: { id: "itunes_current_track_album", value: "" },
  CurrentTrackName: { id: "itunes_current_track_name", value: "" },
  CurrentTrackArtist: { id: "itunes_current_track_artist", value: "" },
  CurrentTrackAlbumArtwork: {
    id: "itunes_current_track_album_artwork",
    value: "",
  },
  CurrentTrackPlayedTime: {
    id: "itunes_current_track_play_time",
    value: "0:00",
  },
  CurrentTrackRemainingTime: {
    id: "itunes_current_track_remaining_time",
    value: "0:00",
  },
  Repeat: { id: "itunes_repeat", value: "Off" },
  Shuffle: { id: "itunes_shuffle", value: "Off" },
  Playlists: { id: "itunes_playlists", valueChoices: [], index: {} },
};

const getiTunesLibrary = () => {
  if (!iTunes.Sources) {
    console.log(pluginId, ": ERROR : iTunes.Sources does not exist");
    return;
  }
  for (let i = 1; i <= iTunes.Sources.Count; i++) {
    if (iTunes.Sources.Item[i].Kind == LIBRARY_TYPE) {
      iTunesLibrary = iTunes.Sources.Item[i];
      break;
    }
  }
  return;
};

const getIsPlaying = () => {
  return iTunes.PlayerState ? "Playing" : "Stopped";
};

const getVolume = () => {
  return iTunes.SoundVolume;
};

const getRoundVolume = () => {
    let roundBy = pluginSettings['Volume RoundBy Number'] ? pluginSettings['Volume RoundBy Number'] : 10;
    return Math.round(iTunes.SoundVolume / roundBy) * roundBy;
}

const getCurrentTrack = () => {
  return iTunes.CurrentTrack;
};

const getCurrentTrackArtist = () => {
  const track = getCurrentTrack();
  return track ? track.Artist : "";
};

const getCurrentTrackName = () => {
  const track = getCurrentTrack();
  return track ? track.Name : "";
};

const getCurrentTrackAlbum = () => {
  const track = getCurrentTrack();
  return track ? track.Album : "";
};

const getCurrentTrackAlbumArtwork = () => {
  const track = getCurrentTrack();
  if (!track) {
    return undefined;
  }
  const orig = path.join(process.argv[2], "./album_artwork_temp_orig.png");
  track.Artwork.Item[1].SaveArtworkToFile(orig);
  let base64data = undefined;
  let buff = fs.readFileSync(orig);
  base64data = buff.toString("base64");
  return base64data;
};

const getPlayerPosition = () => {
  return iTunes.PlayerPosition;
};

const getCurrentTrackPlayTime = () => {
  let playerPosition = getPlayerPosition();
  let currentTrack = getCurrentTrack();
  let trackDuration = currentTrack.Duration;

  const sec_per_min = 60;
  const playedMins = Math.floor(playerPosition / sec_per_min);
  const playedSec = playerPosition % sec_per_min;
  const playedTime =
    playedMins + ":" + (playedSec < 10 ? `0${playedSec}` : playedSec);
  const remaining = trackDuration - playerPosition;
  const remainingMins = Math.floor(remaining / sec_per_min);
  const remainingSec = remaining % sec_per_min;
  const remainingTime =
    "-" +
    remainingMins +
    ":" +
    (remainingSec < 10 ? `0${remainingSec}` : remainingSec);

  return [playedTime, remainingTime];
};

const getCurrentPlaylist = () => {
  return iTunes.CurrentPlaylist;
};

const getShuffle = () => {
  const playlist = getCurrentPlaylist();
  return !playlist ? "Off" : playlist.Shuffle ? "On" : "Off";
};

const repeatMode = ["Off", "Song", "Playlist"];

const getRepeat = () => {
  const playlist = getCurrentPlaylist();
  return playlist ? repeatMode[playlist.SongRepeat] : "Off";
};

const getiTunesPlaylists = () => {
  const playlists = iTunesLibrary.Playlists;
  let playlistNames = [];
  let updateNeeded = false;

  //Indexing the playlists
  for (let i = 1; i <= playlists.Count; i++) {
    const playlist = playlists.Item[i];
    const playlistName = playlist.Name.replace(playlistRegex,'\'');
    if( iTunesStates.Playlists.index[playlistName] === undefined ) {
        iTunesStates.Playlists.index[playlistName] = playlist;
        updateNeeded = true;
    }
    playlistNames.push(playlistName);
  }

  return [ updateNeeded, playlistNames ];
};

const initializeStates = async () => {
  getiTunesLibrary();

  iTunesStates.PlayerState.value = getIsPlaying();
  iTunesStates.Volume.value = getRoundVolume() + "";
  iTunesStates.CurrentTrackAlbum.value = getCurrentTrackAlbum();
  iTunesStates.CurrentTrackName.value = getCurrentTrackName();
  iTunesStates.CurrentTrackArtist.value = getCurrentTrackArtist();
  if (pluginSettings["Display Artwork"] === "On") {
    iTunesStates.CurrentTrackAlbumArtwork.value = getCurrentTrackAlbumArtwork();
  }
  iTunesStates.Shuffle.value = getShuffle();
  iTunesStates.Repeat.value = getRepeat();

  if (iTunesStates.PlayerState.value === "Playing") {
    //get time here
    if (pluginSettings["Track Timers"] === "On") {
      const [playedTime, remainingTime] = getCurrentTrackPlayTime();
      iTunesStates.CurrentTrackPlayedTime.value = playedTime;
      iTunesStates.CurrentTrackRemainingTime.value = remainingTime;
    }
  }

  let stateArray = [];
  Object.keys(iTunesStates).forEach((key) => {
    if (iTunesStates[key].value != undefined) {
      stateArray.push(iTunesStates[key]);
    }
  });

  updateTPClientStates(stateArray);

  updatePlaylists();
};

const updatePlaylists = () => {

  let updateNeeded = false;
  [updateNeeded, iTunesStates.Playlists.value] = getiTunesPlaylists();

  if( updateNeeded ) {
      TPClient.choiceUpdateSpecific(
        iTunesStates.Playlists.id,
        iTunesStates.Playlists.value,
        "itunes_play_playlist"
      );
  }
};

let running = false;
const updateStates = (resend = false ) => {
  if (running) {
    return;
  }
  console.log(pluginId, ": DEBUG : updateStates", `resend ${resend} running ${running}`);
  running = true;
  let stateArray = [];
  if (resend || iTunesStates.PlayerState.value !== getIsPlaying()) {
    iTunesStates.PlayerState.value = getIsPlaying();
    stateArray.push(iTunesStates.PlayerState);
  }
  if (resend || iTunesStates.Volume.value !== getRoundVolume() + "") {
    iTunesStates.Volume.value = getRoundVolume() + "";
    stateArray.push(iTunesStates.Volume);
  }
  if (resend || iTunesStates.CurrentTrackName.value !== getCurrentTrackName()) {
    iTunesStates.CurrentTrackAlbum.value = getCurrentTrackAlbum();
    iTunesStates.CurrentTrackName.value = getCurrentTrackName();
    iTunesStates.CurrentTrackArtist.value = getCurrentTrackArtist();
    stateArray.push(iTunesStates.CurrentTrackAlbum);
    stateArray.push(iTunesStates.CurrentTrackName);
    stateArray.push(iTunesStates.CurrentTrackArtist);
    if (pluginSettings["Display Artwork"] === "On") {
      iTunesStates.CurrentTrackAlbumArtwork.value = getCurrentTrackAlbumArtwork();
      stateArray.push(iTunesStates.CurrentTrackAlbumArtwork);
    }
  }
  if (iTunesStates.PlayerState.value === "Playing") {
    if (pluginSettings["Track Timers"] === "On") {
      //get time here
      const [playedTime, remainingTime] = getCurrentTrackPlayTime();
      iTunesStates.CurrentTrackPlayedTime.value = playedTime;
      iTunesStates.CurrentTrackRemainingTime.value = remainingTime;
      stateArray.push(iTunesStates.CurrentTrackPlayedTime);
      stateArray.push(iTunesStates.CurrentTrackRemainingTime);
    }
  }
  if (resend || iTunesStates.Shuffle.value !== getShuffle()) {
    iTunesStates.Shuffle.value = getShuffle();
    stateArray.push(iTunesStates.Shuffle);
  }
  if (resend || iTunesStates.Repeat.value !== getRepeat()) {
    iTunesStates.Repeat.value = getRepeat();
    stateArray.push(iTunesStates.Repeat);
  }
  updatePlaylists();

  if (stateArray.length > 0) {
    updateTPClientStates(stateArray);
  }
  running = false;
};

const updateTPClientStates = (states) => {
  TPClient.stateUpdateMany(states);
};

const updateTPClientChoices = (choices) => {
  choices.forEach((choiceList) => {
    TPClient.choiceUpdate(choiceList.id, choiceList.value);
  });
};

let updateInterval = undefined;
TPClient.on("Info", (message) => {
  initializeStates();
  updateInterval = setInterval(() => {
    updateStates(false);
  }, 1000);
});

TPClient.on("Settings", (message) => {
  console.log(pluginId, ": DEBUG : SETTINGS ", JSON.stringify(message));
  message.forEach( (setting) => {
    let key = Object.keys(setting)[0];
    pluginSettings[key] = setting[key];
  });
});

TPClient.on("Close", () => {
  clearInterval(updateInterval);
});

TPClient.on("Broadcast", () => {
  console.log(pluginId, ": DEBUG : Broadcast - updateStates called");
  running = false;
  updateStates(true);
})

TPClient.on("Action", async (message,hold) => {
  console.log(pluginId, ": DEBUG : ACTION ", JSON.stringify(message), "hold", hold);

  if( hold ) {
      heldAction[message.actionId] = true;
  }
  else if ( !hold ) {
      delete heldAction[message.actionId];
  }

  if (message.actionId === "itunes_toggle_play_action") {
    getIsPlaying() == "Playing" ? iTunes.Pause() : iTunes.Play();
  } else if (message.actionId === "itunes_next_track") {
    iTunes.NextTrack();
  } else if (message.actionId === "itunes_back_track") {
    iTunes.BackTrack();
  } else if (message.actionId === "itunes_shuffle_action") {
    const playlist = getCurrentPlaylist();
    playlist.Shuffle = getShuffle() === "On" ? 0 : 1;
  } else if (message.actionId === "itunes_repeat_action") {
    const playlist = getCurrentPlaylist();
    playlist.SongRepeat = (playlist.SongRepeat + 1) % 3;
  } else if (message.actionId === "itunes_volume_adjust") {
    let adjustVol = parseInt(message.data[0].value,10);
    while( hold === undefined || hold === null || heldAction[message.actionId] ) {
        const vol = getVolume();
        let newVol = vol + adjustVol;
        newVol = newVol < 0 ? 0 : newVol > 100 ? 100 : newVol;
        iTunes.SoundVolume = newVol;
        if( hold !== undefined && hold !== null ) {
          await new Promise(r => setTimeout(r,100));
          if( !heldAction[message.actionId] || newVol === 0 || newVol === 100 ) { break; }
        }
    }
  } else if (message.actionId === "itunes_volume_up") {
    const vol = parseInt(getVolume(), 10);
    let newVol  = vol + 10;
    newVol = vol < 100 ? vol : 100;
    iTunes.SoundVolume = newVol;
  } else if (message.actionId === "itunes_volume_down") {
    const vol = parseInt(getVolume(), 10);
    let newVol  = vol - 10;
    newVol = 0 < vol ? vol : 0;
    iTunes.SoundVolume = newVol;
  } else if (message.actionId === "itunes_play_playlist") {
    if (message.data.length > 0) {
      const playlistName = message.data[0].value;
      const shuffleStatus = message.data[1].value;
      const repeatStatus = message.data[2].value;

      const playlist = iTunesStates.Playlists.index[playlistName];
      playlist.Shuffle = shuffleStatus === "On" ? true : false;
      playlist.SongRepeat =
        repeatStatus === "Off" ? 0 : repeatStatus === "Song" ? 1 : 2;

      playlist.PlayFirstTrack();
    }
  }

  updateStates();
});

TPClient.connect({ pluginId });
