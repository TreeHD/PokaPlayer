const mongoose = require('mongoose')
const {
    db
} = require('./db.js')
const songSchema = new mongoose.Schema({
    name: String,
    artist: String,
    artistId: String,
    album: String,
    albumId: String,
    cover: String,
    url: String,
    source: String,
    id: String,
});
const playlistSchema = new mongoose.Schema({
    name: String,
    image: String,
    pinned: {
        type: Boolean,
        default: false
    },
    source: {
        type: String,
        default: 'poka'
    },
    songs: [songSchema]
});

const model = mongoose.model('Playlist', playlistSchema)

function parsePlaylist(playlist) {
    return ({
        songs: playlist.songs || [],
        playlists: [{
            name: playlist.name,
            source: playlist.source,
            id: playlist._id,
            image: playlist.image
        }]
    })
}

function parsePlaylists(playlists) {
    return playlists.map(x => ({
        name: x.name,
        source: x.source,
        id: x._id,
        image: x.image
    }))
}

async function createPlaylist(name) {
    let playlist = new model({
        name
    })
    await playlist.save(err => err ? console.error(err) : null)
    return ({
        success: true,
        playlist
    })
}

async function delPlaylist(id) {
    try {
        await model.deleteOne({
            "_id": id
        })
        return ({
            success: true,
            error: null
        })
    } catch (e) {
        return ({
            success: false,
            error: e
        })
    }
}
async function editPlaylist(id, data) {
    try {
        let playlist = await getPlaylistById(id)
        if (data.name)
            playlist.name = data.name
        if (data.image)
            playlist.image = data.image
        playlist.save()
        return ({
            success: true,
            error: null,
            playlist
        })
    } catch (e) {
        return ({
            success: false,
            error: e
        })
    }
}

async function getPlaylistById(id) {
    return (await model.findById(id, err => err ? console.error(err) : null))
}
async function getParsedPlaylistById(id) {
    return parsePlaylist(await model.findById(id, err => err ? console.error(err) : null))
}
async function getPlaylists() {
    return (await model.find())
}
async function getParsedPlaylists() {
    return parsePlaylists(await model.find())
}
async function toggleSongOfPlaylist({
    playlistId,
    song
}) {
    try {
        let playlist = await getPlaylistById(playlistId)
        if (playlist.songs.filter(x => x.id == song.id && x.source == song.source).length > 0) {
            playlist.songs = playlist.songs.filter(x => x.id != song.id || x.source != song.source)
        } else {
            playlist.songs.push(song)
        }
        await playlist.save(err => err ? console.error(err) : null)
    } catch (e) {
        return ({
            success: false,
            error: e
        })
    }
}
module.exports = {
    createPlaylist,
    delPlaylist,
    editPlaylist,
    getPlaylists,
    getParsedPlaylistById,
    getPlaylistById,
    getParsedPlaylists,
    //song
    toggleSongOfPlaylist,
    //parse
    parsePlaylist,
    parsePlaylists
}