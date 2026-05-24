import json
import random
import binascii
import base64
import requests
from Crypto.Cipher import AES

FIXED_KEY = '0CoJUm6Qyw8W8jud'
IV = b'0102030405060708'
RSA_MODULUS = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7'
RSA_EXPONENT = '010001'
CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
BASE_URL = 'https://music.163.com/weapi'

session = requests.Session()
session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://music.163.com/',
})


def _aes_encrypt(text, key):
    pad = 16 - len(text) % 16
    text += chr(pad) * pad
    cipher = AES.new(key.encode('utf-8'), AES.MODE_CBC, IV)
    return base64.b64encode(cipher.encrypt(text.encode('utf-8'))).decode()


def _rsa_encrypt(text):
    reversed_key = text[::-1]
    m = int(binascii.hexlify(reversed_key.encode('utf-8')).decode(), 16)
    e = int(RSA_EXPONENT, 16)
    n = int(RSA_MODULUS, 16)
    return format(pow(m, e, n), 'x').zfill(256)


def encrypt_weapi(data):
    data_str = json.dumps(data)
    first = _aes_encrypt(data_str, FIXED_KEY)
    random_key = ''.join(random.choice(CHARS) for _ in range(16))
    params = _aes_encrypt(first, random_key)
    enc_sec_key = _rsa_encrypt(random_key)
    return {'params': params, 'encSecKey': enc_sec_key}


def weapi_request(endpoint, data):
    url = f'{BASE_URL}{endpoint}'
    encrypted = encrypt_weapi(data)
    resp = session.post(url, data=encrypted)
    resp.raise_for_status()
    return resp.json()


def get_song_detail(song_id):
    data = {'c': json.dumps([{'id': song_id}]), 'ids': json.dumps([song_id])}
    result = weapi_request('/v3/song/detail', data)
    songs = result.get('songs', [])
    if not songs:
        return None
    s = songs[0]
    artists = ', '.join(a['name'] for a in s.get('ar', s.get('artists', [])))
    return {
        'id': s['id'],
        'title': s['name'],
        'artist': artists,
        'albumArt': s.get('al', s.get('album', {})).get('picUrl', ''),
        'duration': s.get('dt', 0),
    }


def get_song_url(song_id, bitrate=999000):
    # 优先拿完整版
    data = {'ids': json.dumps([song_id]), 'br': bitrate}
    result = weapi_request('/song/enhance/player/url', data)
    items = result.get('data', [])
    if items and items[0].get('url'):
        return items[0]['url']

    # 拿不到就尝试获取试听片段（30 秒免费试听）
    data = {'ids': json.dumps([song_id]), 'br': 128000, 'header': '{"immerseType":"8001"}'}
    result = weapi_request('/song/enhance/player/url/v1', data)
    items = result.get('data', [])
    if items and items[0].get('url'):
        return items[0]['url']

    # 最后尝试降低音质获取
    data = {'ids': json.dumps([song_id]), 'br': 128000}
    result = weapi_request('/song/enhance/player/url', data)
    items = result.get('data', [])
    return items[0].get('url') if items else None


def get_song_lyric(song_id):
    data = {'id': song_id, 'lv': -1, 'kv': -1, 'tv': -1}
    result = weapi_request('/song/lyric', data)
    return {
        'lyric': result.get('lrc', {}).get('lyric', ''),
        'tlyric': result.get('tlyric', {}).get('lyric', ''),
    }


def search_songs(keyword, limit=15):
    data = {'s': keyword, 'type': 1, 'offset': 0, 'limit': limit}
    result = weapi_request('/cloudsearch/pc', data)
    songs = result.get('result', {}).get('songs', [])
    return [{
        'id': s['id'],
        'title': s['name'],
        'artist': ', '.join(a['name'] for a in s.get('ar', s.get('artists', []))),
        'albumArt': s.get('al', s.get('album', {})).get('picUrl', ''),
        'duration': s.get('dt', 0),
    } for s in songs]
