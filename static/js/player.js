// === DOM 引用 ===
const audio = document.getElementById('audioPlayer');
const playBtn = document.getElementById('playBtn');
const playIcon = document.getElementById('playIcon');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const albumArt = document.getElementById('albumArt');
const coverRotate = document.getElementById('coverRotate');
const songTitle = document.getElementById('songTitle');
const songArtist = document.getElementById('songArtist');
const currentTime = document.getElementById('currentTime');
const totalTime = document.getElementById('totalTime');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressThumb = document.getElementById('progressThumb');
const volumeBar = document.getElementById('volumeBar');
const volumeFill = document.getElementById('volumeFill');
const volumeThumb = document.getElementById('volumeThumb');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchResults = document.getElementById('searchResults');
const playlistItems = document.getElementById('playlistItems');
const playlistCount = document.getElementById('playlistCount');
const clearPlaylistBtn = document.getElementById('clearPlaylistBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsClose = document.getElementById('settingsClose');
const lyricsArea = document.getElementById('lyricsArea');
const lyricsScroll = document.getElementById('lyricsScroll');

// === 状态 ===
let playlist = [];
let currentIndex = -1;
let isDraggingProgress = false;
let isDraggingVolume = false;
let lyricsData = [];
let lyricsCache = {};
let currentFetchId = 0; // 防竞态：标记最新的切歌请求

// === 默认设置 ===
const DEFAULT_SETTINGS = {
    bgImage: '',
    theme: 'purple',
    customColor: '#a18cd1',
    showLyrics: true,
    showPlaylist: true,
};

let settings = {};

// === 工具函数 ===
function formatTime(sec) {
    if (isNaN(sec) || !isFinite(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function hexToRgb(hex) {
    const v = parseInt(hex.replace('#', ''), 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function adjustColor(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    const nr = Math.min(255, Math.max(0, r + amount));
    const ng = Math.min(255, Math.max(0, g + amount));
    const nb = Math.min(255, Math.max(0, b + amount));
    return `#${((1 << 24) | (nr << 16) | (ng << 8) | nb).toString(16).slice(1)}`;
}

// === 设置管理 ===
function loadSettings() {
    try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('playerSettings')) };
    } catch { return { ...DEFAULT_SETTINGS }; }
}

function saveSettings(s) {
    localStorage.setItem('playerSettings', JSON.stringify(s));
}

function applySettings(s) {
    if (s.theme === 'custom') {
        document.body.className = '';
        document.body.style.setProperty('--accent-1', s.customColor);
        document.body.style.setProperty('--accent-2', adjustColor(s.customColor, 40));
        document.body.style.setProperty('--accent-shadow', s.customColor + '66');
        document.body.style.setProperty('--active-bg', s.customColor + '33');
    } else {
        document.body.className = 'theme-' + s.theme;
        ['--accent-1', '--accent-2', '--accent-shadow', '--active-bg'].forEach(p =>
            document.body.style.removeProperty(p));
    }

    if (s.bgImage) {
        document.body.style.backgroundImage = `url(${JSON.stringify(s.bgImage)})`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundRepeat = 'no-repeat';
        document.body.style.backgroundAttachment = 'fixed';
    } else {
        document.body.style.backgroundImage = '';
        document.body.style.backgroundSize = '';
        document.body.style.backgroundPosition = '';
        document.body.style.backgroundRepeat = '';
        document.body.style.backgroundAttachment = '';
    }

    lyricsArea.classList.toggle('show', s.showLyrics);
    document.getElementById('playlist').style.display = s.showPlaylist ? 'block' : 'none';
    document.getElementById('showLyrics').checked = s.showLyrics;
    document.getElementById('showPlaylist').checked = s.showPlaylist;

    document.querySelectorAll('.theme-item').forEach(el => {
        el.classList.toggle('active', el.dataset.theme === s.theme);
    });
    document.getElementById('customColorPicker').value = s.customColor;
}

// === 音频控制（纯原生 <audio>） ===
function play() {
    audio.play().catch(() => {});
    coverRotate.classList.add('playing');
    coverRotate.classList.remove('paused');
    playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
}

function pause() {
    audio.pause();
    coverRotate.classList.add('paused');
    playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
}

function togglePlay() {
    if (audio.paused) play();
    else pause();
}

function playSong(index) {
    if (index < 0 || index >= playlist.length) return;
    currentIndex = index;
    const song = playlist[currentIndex];
    songTitle.textContent = song.title;
    songArtist.textContent = song.artist;
    if (song.albumArt) albumArt.src = song.albumArt + '?param=300y300';

    const thisFetch = ++currentFetchId;
    fetch(`/api/song/${song.id}/url`)
        .then(r => r.json())
        .then(data => {
            if (thisFetch !== currentFetchId) return; // 已切到别的歌
            if (data.url) { audio.src = data.url; audio.load(); play(); }
        });

    fetchLyrics(song.id);
    renderPlaylist(true);
    savePlaylist();
}

function savePlaylist() {
    try { localStorage.setItem('playerPlaylist', JSON.stringify(playlist)); } catch {}
}

function loadPlaylist() {
    try {
        const saved = JSON.parse(localStorage.getItem('playerPlaylist'));
        if (saved && saved.length) playlist = saved;
    } catch {}
}

function playNext() {
    if (playlist.length === 0) return;
    playSong((currentIndex + 1) % playlist.length);
}

function playPrev() {
    if (playlist.length === 0) return;
    playSong((currentIndex - 1 + playlist.length) % playlist.length);
}

// === 搜索 ===
function doSearch(keyword) {
    if (!keyword.trim()) return;
    fetch(`/api/search?keyword=${encodeURIComponent(keyword)}`)
        .then(r => r.json())
        .then(data => { if (!data.error) renderSearchResults(data); });
}

function renderSearchResults(songs) {
    searchResults.innerHTML = '';
    searchResults.classList.add('show');
    if (songs.length === 0) {
        searchResults.innerHTML = '<div class="search-result-item" style="color:rgba(255,255,255,0.4);justify-content:center;">未找到结果</div>';
        return;
    }
    songs.forEach(song => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.innerHTML = `
            <img src="${song.albumArt || ''}?param=80y80" alt="" onerror="this.style.display='none'">
            <div class="result-info">
                <div class="result-title">${song.title}</div>
                <div class="result-artist">${song.artist}</div>
            </div>`;
        div.addEventListener('click', () => {
            if (!playlist.find(s => s.id === song.id)) {
                playlist.push(song);
                renderPlaylist();
                savePlaylist();
            }
            playSong(playlist.findIndex(s => s.id === song.id));
            searchResults.classList.remove('show');
            searchInput.blur();
        });
        searchResults.appendChild(div);
    });
}

// === 播放列表 ===
function renderPlaylist(skipScroll) {
    playlistItems.innerHTML = '';
    playlistCount.textContent = `${playlist.length} 首`;
    playlist.forEach((song, i) => {
        const div = document.createElement('div');
        div.className = 'playlist-item';
        if (i === currentIndex) div.classList.add('active');
        div.innerHTML = `
            <img src="${song.albumArt || ''}?param=64y64" alt="" onerror="this.style.display='none'">
            <div class="pli-info">
                <div class="pli-title">${song.title}</div>
                <div class="pli-artist">${song.artist}</div>
            </div>
            <button class="playlist-del-btn" data-i="${i}">&times;</button>`;
        div.querySelector('.pli-info').addEventListener('click', () => playSong(i));
        div.querySelector('.playlist-del-btn').addEventListener('click', e => {
            e.stopPropagation();
            removeFromPlaylist(parseInt(e.currentTarget.dataset.i));
        });
        playlistItems.appendChild(div);
    });
    if (!skipScroll && currentIndex >= 0) {
        const active = playlistItems.querySelector('.active');
        if (active) active.scrollIntoView({ block: 'nearest' });
    }
}

function removeFromPlaylist(index) {
    const wasCurrent = index === currentIndex;
    playlist.splice(index, 1);
    if (index < currentIndex) currentIndex--;
    else if (wasCurrent) {
        if (playlist.length > 0) {
            currentIndex = Math.min(currentIndex, playlist.length - 1);
            playSong(currentIndex);
        } else {
            currentIndex = -1;
            pause();
            audio.src = '';
            songTitle.textContent = '选择一个歌曲';
            songArtist.textContent = '开始你的音乐之旅';
            lyricsData = [];
            lyricsScroll.innerHTML = '';
        }
    }
    renderPlaylist();
    savePlaylist();
}

function clearPlaylist() {
    if (playlist.length === 0) return;
    playlist = [];
    currentIndex = -1;
    pause();
    audio.src = '';
    songTitle.textContent = '选择一个歌曲';
    songArtist.textContent = '开始你的音乐之旅';
    lyricsData = [];
    lyricsScroll.innerHTML = '';
    renderPlaylist();
}

// === 进度条 ===
function updateProgress() {
    if (isDraggingProgress) return;
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    progressFill.style.width = `${pct}%`;
    progressThumb.style.left = `${pct}%`;
    currentTime.textContent = formatTime(audio.currentTime);
    updateLyrics();
}

function setProgress(e) {
    const rect = progressBar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    progressFill.style.width = `${pct}%`;
    progressThumb.style.left = `${pct}%`;
    if (audio.duration) audio.currentTime = (pct / 100) * audio.duration;
}

progressBar.addEventListener('mousedown', e => {
    isDraggingProgress = true;
    progressBar.classList.add('dragging');
    setProgress(e);
});
document.addEventListener('mousemove', e => { if (isDraggingProgress) setProgress(e); });
document.addEventListener('mouseup', () => {
    if (isDraggingProgress) {
        isDraggingProgress = false;
        progressBar.classList.remove('dragging');
    }
});

// === 音量 ===
function setVolume(e) {
    const rect = volumeBar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    volumeFill.style.width = `${pct}%`;
    volumeThumb.style.left = `${pct}%`;
    audio.volume = pct / 100;
}

volumeBar.addEventListener('mousedown', e => {
    isDraggingVolume = true;
    volumeBar.classList.add('dragging');
    setVolume(e);
});
document.addEventListener('mousemove', e => { if (isDraggingVolume) setVolume(e); });
document.addEventListener('mouseup', () => {
    if (isDraggingVolume) {
        isDraggingVolume = false;
        volumeBar.classList.remove('dragging');
    }
});

// === 歌词 ===
function fetchLyrics(songId) {
    lyricsScroll.innerHTML = '<div class="lyric-line" style="color:rgba(255,255,255,0.2)">加载歌词中...</div>';
    if (lyricsCache[songId]) {
        lyricsData = lyricsCache[songId];
        renderLyrics();
        return;
    }
    fetch(`/api/song/${songId}/lyric`)
        .then(r => r.json())
        .then(data => {
            lyricsData = parseLRC(data.lyric);
            lyricsCache[songId] = lyricsData;
            renderLyrics();
        })
        .catch(() => {
            lyricsData = [];
            lyricsScroll.innerHTML = '<div class="lyric-line" style="color:rgba(255,255,255,0.2)">歌词加载失败</div>';
        });
}

function parseLRC(text) {
    if (!text) return [];
    const result = [];
    text.split('\n').forEach(line => {
        const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\]/);
        if (!m) return;
        const t = parseInt(m[1]) * 60 + parseFloat(m[2]);
        const txt = line.replace(/\[.*?\]/g, '').trim();
        if (txt) result.push({ time: t, text: txt });
    });
    return result.sort((a, b) => a.time - b.time);
}

function renderLyrics() {
    lyricsScroll.innerHTML = '';
    if (lyricsData.length === 0) {
        lyricsScroll.innerHTML = '<div class="lyric-line" style="color:rgba(255,255,255,0.2)">暂无歌词</div>';
        return;
    }
    lyricsData.forEach((line, i) => {
        const div = document.createElement('div');
        div.className = 'lyric-line';
        div.dataset.index = i;
        div.textContent = line.text;
        lyricsScroll.appendChild(div);
    });
}

function updateLyrics() {
    if (lyricsData.length === 0) return;
    const ct = audio.currentTime;
    let idx = -1;
    for (let i = 0; i < lyricsData.length; i++) {
        if (ct >= lyricsData[i].time) idx = i;
    }
    document.querySelectorAll('.lyric-line').forEach((el, i) => {
        el.classList.toggle('active', i === idx);
    });
    if (idx >= 0) {
        const el = document.querySelector(`.lyric-line[data-index="${idx}"]`);
        if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
}

// === 导入导出 ===
function exportConfig() {
    const data = { settings, playlist };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'music-player-config.json';
    a.click();
}

function importConfig(file) {
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.settings) {
                Object.assign(settings, data.settings);
                saveSettings(settings);
                applySettings(settings);
            }
            if (data.playlist && Array.isArray(data.playlist)) {
                playlist = data.playlist;
                renderPlaylist();
                savePlaylist();
            }
            alert('配置导入成功！');
        } catch { alert('配置文件格式错误'); }
    };
    reader.readAsText(file);
}

// === 设置面板 ===
settingsBtn.addEventListener('click', () => settingsOverlay.classList.add('show'));
settingsClose.addEventListener('click', () => settingsOverlay.classList.remove('show'));
settingsOverlay.addEventListener('click', e => {
    if (e.target === settingsOverlay) settingsOverlay.classList.remove('show');
});

document.querySelectorAll('.theme-item').forEach(el => {
    el.addEventListener('click', () => {
        settings.theme = el.dataset.theme;
        applySettings(settings);
        saveSettings(settings);
    });
});

document.getElementById('customColorPicker').addEventListener('input', e => {
    if (settings.theme === 'custom') {
        settings.customColor = e.target.value;
        applySettings(settings);
        saveSettings(settings);
    }
});

document.getElementById('bgFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        settings.bgImage = ev.target.result;
        applySettings(settings);
        saveSettings(settings);
    };
    reader.readAsDataURL(file);
});

document.getElementById('bgUrlApply').addEventListener('click', () => {
    const url = document.getElementById('bgUrlInput').value.trim();
    if (url) {
        settings.bgImage = url;
        applySettings(settings);
        saveSettings(settings);
    }
});

document.getElementById('bgUrlInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('bgUrlApply').click();
});

document.getElementById('bgRemove').addEventListener('click', () => {
    settings.bgImage = '';
    document.getElementById('bgUrlInput').value = '';
    document.getElementById('bgFileInput').value = '';
    applySettings(settings);
    saveSettings(settings);
});

document.getElementById('showLyrics').addEventListener('change', e => {
    settings.showLyrics = e.target.checked;
    applySettings(settings);
    saveSettings(settings);
});

document.getElementById('showPlaylist').addEventListener('change', e => {
    settings.showPlaylist = e.target.checked;
    applySettings(settings);
    saveSettings(settings);
});

document.getElementById('exportConfigBtn').addEventListener('click', exportConfig);
document.getElementById('importConfigInput').addEventListener('change', e => {
    if (e.target.files[0]) importConfig(e.target.files[0]);
    e.target.value = '';
});

// === 事件绑定 ===
playBtn.addEventListener('click', togglePlay);
prevBtn.addEventListener('click', playPrev);
nextBtn.addEventListener('click', playNext);
clearPlaylistBtn.addEventListener('click', clearPlaylist);

audio.addEventListener('timeupdate', updateProgress);
audio.addEventListener('loadedmetadata', () => {
    totalTime.textContent = formatTime(audio.duration);
});
audio.addEventListener('ended', playNext);

let searchTimer;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const val = searchInput.value.trim();
    if (!val) { searchResults.classList.remove('show'); return; }
    searchTimer = setTimeout(() => doSearch(val), 300);
});
searchBtn.addEventListener('click', () => doSearch(searchInput.value));
searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(searchInput.value); }
});
document.addEventListener('click', e => {
    if (!e.target.closest('.search-area')) searchResults.classList.remove('show');
});

document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowLeft') playPrev();
    if (e.code === 'ArrowRight') playNext();
});

// === 初始化 ===
settings = loadSettings();
applySettings(settings);
loadPlaylist();
if (playlist.length) renderPlaylist();
audio.volume = 0.7;
volumeFill.style.width = '70%';
volumeThumb.style.left = '70%';
