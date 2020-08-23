const path = require("path");
const fs = require("fs");
const winax = require("winax");
const removeAccents = require("remove-accents");
const config = require(path.join(process.argv[2],"/config.json"));
const playlistRegex = /’/;

var interval = setInterval(function () {
  winax.peekAndDispatchMessages(); // allows ActiveX event to be dispatched
}, 50);
const TPClient = new (require("touchportal-api").Client)();

const iTunes = new winax.Object("iTunes.Application");

const LIBRARY_TYPE = 1;

const pluginId = "TPiTunes";

let iTunesLibrary = null;
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
  let vol = Math.round(iTunes.SoundVolume / 10) * 10;
  return vol;
};

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
    return null;
  }
  const orig = path.join(process.argv[2], "./album_artwork_temp_orig.png");
  track.Artwork.Item[1].SaveArtworkToFile(orig);
  let base64data = null;
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

  //Indexing the playlists
  for (let i = 1; i <= playlists.Count; i++) {
    const playlist = playlists.Item[i];
    // TODO: If playlist doesn't exist in index - need to update choiceList for playlists
    const playlistName = removeAccents(playlist.Name.toString().replace(playlistRegex,'\''));
    iTunesStates.Playlists.index[playlistName] = playlist;
    playlistNames.push(playlistName);
  }


  return playlistNames;
};

const initializeStates = async () => {
  getiTunesLibrary();

  iTunesStates.PlayerState.value = getIsPlaying();
  iTunesStates.Volume.value = getVolume() + "";
  iTunesStates.CurrentTrackAlbum.value = getCurrentTrackAlbum();
  iTunesStates.CurrentTrackName.value = getCurrentTrackName();
  iTunesStates.CurrentTrackArtist.value = getCurrentTrackArtist();
  if (config.artwork === "On") {
    iTunesStates.CurrentTrackAlbumArtwork.value = getCurrentTrackAlbumArtwork();
  }
  iTunesStates.Shuffle.value = getShuffle();
  iTunesStates.Repeat.value = getRepeat();

  if (iTunesStates.PlayerState.value === "Playing") {
    //get time here
    if (config.timers === "On") {
      const [playedTime, remainingTime] = getCurrentTrackPlayTime();
      iTunesStates.CurrentTrackPlayedTime.value = playedTime;
      iTunesStates.CurrentTrackRemainingTime.value = remainingTime;
    }
  }

  let stateArray = [];
  Object.keys(iTunesStates).forEach((key) => {
    if (iTunesStates[key].value != null) {
      stateArray.push(iTunesStates[key]);
    }
  });

  updateTPClientStates(stateArray);

  let choiceArray = [];
  iTunesStates.Playlists.value = getiTunesPlaylists();

  choiceArray.push(iTunesStates.Playlists);

  TPClient.choiceUpdateSpecific(
    iTunesStates.Playlists.id,
    iTunesStates.Playlists.value,
    "itunes_play_playlist"
  );

  updateTPClientChoices(choiceArray);
};

let running = false;
const updateStates = () => {
  if (running) {
    return;
  }
  running = true;
  let stateArray = [];
  if (iTunesStates.PlayerState.value !== getIsPlaying()) {
    iTunesStates.PlayerState.value = getIsPlaying();
    stateArray.push(iTunesStates.PlayerState);
  }
  if (iTunesStates.Volume.value !== getVolume() + "") {
    iTunesStates.Volume.value = getVolume() + "";
    stateArray.push(iTunesStates.Volume);
  }
  if (iTunesStates.CurrentTrackName.value !== getCurrentTrackName()) {
    iTunesStates.CurrentTrackAlbum.value = getCurrentTrackAlbum();
    iTunesStates.CurrentTrackName.value = getCurrentTrackName();
    iTunesStates.CurrentTrackArtist.value = getCurrentTrackArtist();
    stateArray.push(iTunesStates.CurrentTrackAlbum);
    stateArray.push(iTunesStates.CurrentTrackName);
    stateArray.push(iTunesStates.CurrentTrackArtist);
    if (config.artwork === "On") {
      iTunesStates.CurrentTrackAlbumArtwork.value = getCurrentTrackAlbumArtwork();
      stateArray.push(iTunesStates.CurrentTrackAlbumArtwork);
    }
  }
  if (iTunesStates.PlayerState.value === "Playing") {
    if (config.timers === "On") {
      //get time here
      const [playedTime, remainingTime] = getCurrentTrackPlayTime();
      iTunesStates.CurrentTrackPlayedTime.value = playedTime;
      iTunesStates.CurrentTrackRemainingTime.value = remainingTime;
      stateArray.push(iTunesStates.CurrentTrackPlayedTime);
      stateArray.push(iTunesStates.CurrentTrackRemainingTime);
    }
  }
  if (iTunesStates.Shuffle.value !== getShuffle()) {
    iTunesStates.Shuffle.value = getShuffle();
    stateArray.push(iTunesStates.Shuffle);
  }
  if (iTunesStates.Repeat.value !== getRepeat()) {
    iTunesStates.Repeat.value = getRepeat();
    stateArray.push(iTunesStates.Repeat);
  }

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

let updateInterval = null;
TPClient.on("Info", (data) => {
  initializeStates();
  updateInterval = setInterval(() => {
    updateStates();
  }, 1000);
});

TPClient.on("Close", () => {
  clearInterval(updateInterval);
});

TPClient.on("Action", (message) => {
  console.log(pluginId, ": DEBUG :", JSON.stringify(message));
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
  } else if (message.actionId === "itunes_volume_up") {
    const vol = parseInt(getVolume(), 10);
    iTunes.SoundVolume = vol < 100 ? vol + 10 : 100;
  } else if (message.actionId === "itunes_volume_down") {
    const vol = parseInt(getVolume(), 10);
    iTunes.SoundVolume = vol > 0 ? vol - 10 : 0;
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
