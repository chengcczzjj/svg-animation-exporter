[English](./README_EN.md) | **中文**

# SVG 动画导出工具

将 SVG 动画导出为透明背景 MOV 视频（ProRes 4444），可直接导入剪映等视频编辑软件。

## 功能特点

- 🎬 自动扫描工作目录下的 SVG 动画文件
- 🔍 智能识别 SVG 中的动画类型（入场动画 / 循环动画）
- 📐 支持自定义分辨率缩放和帧率
- 🎥 输出 ProRes 4444 透明背景视频（`.mov`）
- 💻 交互式命令行界面

## 前置要求

- [Node.js](https://nodejs.org/) >= 16
- [FFmpeg](https://ffmpeg.org/) 已安装并添加到系统 PATH

## 安装

```bash
npm install
```

## 快速启动

- **Windows** — 双击 `start.bat` 即可启动
- **macOS / Linux** — 在终端中运行：
  ```bash
  chmod +x start.sh   # 首次使用需添加执行权限
  ./start.sh
  ```

也可以在任意平台的终端中运行：

```bash
npm start
```

运行后会进入交互式界面，按提示操作：

1. 选择要导出的 SVG 文件
2. 选择导出模式（入场动画 / 循环动画 / 两者都导出）
3. 设置帧率和缩放倍率
4. 确认并开始导出

导出的视频会保存在 `output/` 目录下。

## 项目结构

```
├── start.bat              # Windows 一键启动脚本
├── start.sh               # macOS / Linux 启动脚本
├── SVG/                   # SVG 动画源文件目录
├── package.json
├── tools/
│   ├── index.js           # 主入口，串联所有模块
│   ├── cli.js             # 交互式命令行界面
│   ├── config.js          # 配置常量
│   ├── svg-scanner.js     # SVG 文件扫描与解析
│   ├── frame-capture.js   # Puppeteer 截帧
│   ├── video-encoder.js   # FFmpeg 视频编码
│   ├── utils.js           # 工具函数
│   └── web/               # 预览用 Web 页面
└── output/                # 导出的视频文件
```

## 技术栈

- **Puppeteer** - 无头浏览器截帧
- **FFmpeg** (ProRes 4444) - 视频编码
- **Inquirer** - 交互式命令行
- **Chalk / Ora / cli-progress** - 终端美化

## License

MIT
