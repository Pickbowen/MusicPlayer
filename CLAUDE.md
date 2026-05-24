# 网易云音乐 Flask 播放器

## 启动

```bash
python app.py
```

浏览器打开 `http://localhost:5000`

## 项目结构

```
├── app.py             # Flask 路由（4 个 API）
├── netease_api.py     # 网易云 weapi 加密 + 请求封装
├── templates/
│   └── index.html     # 播放器主页面
└── static/
    ├── css/style.css  # 暗色毛玻璃主题样式
    └── js/player.js   # 前端播放器全部逻辑
```

## API 端点

| 路由 | 说明 |
|------|------|
| `GET /` | 播放器页面 |
| `GET /api/song/<id>` | 歌曲详情（标题、艺术家、封面、时长） |
| `GET /api/song/<id>/url` | 歌曲播放 URL |
| `GET /api/song/<id>/lyric` | LRC 格式歌词 |
| `GET /api/search?keyword=xxx` | 搜索歌曲 |

## 技术要点

- **网易云 API**：使用 weapi 加密（AES-128-CBC + RSA），实现在 `netease_api.py`
- **音频播放**：纯浏览器 `<audio>` 原生播放，不涉及 Web Audio API
- **前端**：纯原生 JS，无框架依赖
- **歌词**：LRC 格式解析，按时间戳高亮当前行

## 用户数据

- 设置（主题、背景图等）保存在 `localStorage`，key 为 `playerSettings`

## 打包

- pyinstaller --name "MusicPlayer" --add-data "templates;templates" --add-data "static;static" --onedir app.py