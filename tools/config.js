/**
 * 配置文件 - SVG动画导出工具
 * 集中管理所有默认配置参数
 */
const path = require('path');

module.exports = {
  // ===== 导出设置 =====
  
  // 默认帧率 (fps)
  defaultFps: 30,

  // 默认缩放因子 (1=原始尺寸, 2=2倍, 3=3倍, 4=4倍...)
  // 建议4K视频使用4x或更高，质量优先
  defaultScale: 4,

  // 动画结束后额外捕获的帧数 (确保动画完全结束)
  extraEndFrames: 2,

  // ===== 目录设置 =====
  
  // 输出根目录
  outputDir: path.resolve(__dirname, '..', 'output'),

  // 帧临时子目录名
  framesSubDir: 'frames',

  // ===== 文件设置 =====
  
  // 支持的SVG文件扩展名
  supportedExtensions: ['.svg'],

  // ===== FFmpeg 编码设置 =====
  ffmpeg: {
    // 编码器：prores_ks 是 FFmpeg 中 ProRes 的高质量编码器
    encoder: 'prores_ks',
    
    // Profile：4444xq 是 ProRes 最高质量档位，支持 Alpha 通道
    // 可选: '4444' (高质量) 或 '4444xq' (极致质量)
    profile: '4444xq',
    
    // 像素格式：yuva444p10le 包含 Alpha 通道 (a = alpha)
    pixelFormat: 'yuva444p10le',
    
    // vendor 标记：apl0 确保与 Apple 软件(及剪映)的最佳兼容性
    vendor: 'apl0',

    // 编码质量 (1-31, 1=最佳质量, 越小越好)
    qscale: 1,

    // 每宏块比特数 (越高越好，8000为极高质量)
    bitsPerMb: 8000,
  },

  // ===== Puppeteer 设置 =====
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--font-render-hinting=none',      // 禁用字体hinting，更平滑
      '--disable-lcd-text',              // 禁用LCD文本渲染，避免颜色条纹
      '--force-color-profile=srgb',      // 强制sRGB色彩
      '--disable-gpu-compositing',       // 避免GPU合成导致的细微差异
      '--enable-font-antialiasing',      // 启用字体抗锯齿
    ],
  },
};
