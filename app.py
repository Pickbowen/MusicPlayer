from flask import Flask, jsonify, request, render_template
import netease_api

app = Flask(__name__)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/song/<int:song_id>')
def song_detail(song_id):
    detail = netease_api.get_song_detail(song_id)
    if not detail:
        return jsonify({'error': '歌曲未找到'}), 404
    return jsonify(detail)


@app.route('/api/song/<int:song_id>/url')
def song_url(song_id):
    url = netease_api.get_song_url(song_id)
    if not url:
        return jsonify({'error': '无法获取播放地址'}), 404
    return jsonify({'url': url})


@app.route('/api/song/<int:song_id>/lyric')
def song_lyric(song_id):
    lyric = netease_api.get_song_lyric(song_id)
    return jsonify(lyric)


@app.route('/api/search')
def search():
    keyword = request.args.get('keyword', '')
    if not keyword:
        return jsonify({'error': '请输入搜索关键词'}), 400
    results = netease_api.search_songs(keyword)
    return jsonify(results)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
