const path = require("path");
const fs = require("fs");
const winax = require("winax");

const iTunes = new winax.Object("iTunes.Application");

const LIBRARY_TYPE = 1;
let iTunesLibrary = null;

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


const getiTunesPlaylists = () => {
  const playlists = iTunesLibrary.Playlists;
  let playlistNames = [];

  const regex = /’/;
  //Indexing the playlists
  for (let i = 1; i <= playlists.Count; i++) {
    const playlist = playlists.Item[i];
    // TODO: If playlist doesn't exist in index - need to update choiceList for playlists
    //iTunesStates.Playlists.index[playlist.Name] = playlist;
    playlistNames.push(playlist.Name.toString().replace(regex,'\''));
  }

  return playlistNames;
};

getiTunesLibrary();
let playlists = getiTunesPlaylists();

console.log(playlists);