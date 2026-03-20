/**
 * 视频编码模块
 * 使用 FFmpeg 将 PNG 帧序列合成为带透明通道的 MOV 视频 (ProRes 4444)
 */
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('./config');

/**
 * 将帧序列编码为 MOV 视频
 * 
 * @param {Object} options
 * @param {string} options.framesDir - 帧文件目录 (包含 frame_00000.png 等)
 * @param {number} options.fps - 帧率
 * @param {string} options.outputPath - 输出视频路径
 * @param {Function} [options.onProgress] - 进度回调 (当前帧, 总帧数)
 * @param {number} [options.totalFrames] - 总帧数 (用于进度计算)
 * @returns {Promise<{outputPath: string, fileSize: number}>}
 */
function encodeVideo(options) {
  const {
    framesDir,
    fps,
    outputPath,
    onProgress,
    totalFrames = 0,
  } = options;

  return new Promise((resolve, reject) => {
    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 构建 FFmpeg 参数
    const inputPattern = path.join(framesDir, 'frame_%05d.png');
    const args = [
      '-y',                                      // 覆盖已有文件
      '-framerate', String(fps),                  // 输入帧率
      '-i', inputPattern,                         // 输入帧文件
      '-c:v', config.ffmpeg.encoder,              // 编码器: prores_ks
      '-profile:v', config.ffmpeg.profile,        // Profile: 4444xq (最高质量)
      '-pix_fmt', config.ffmpeg.pixelFormat,      // 像素格式: yuva444p10le (含Alpha)
      '-vendor', config.ffmpeg.vendor,            // vendor标记: apl0
      '-qscale:v', String(config.ffmpeg.qscale),  // 质量等级: 1=最佳
      '-bits_per_mb', String(config.ffmpeg.bitsPerMb), // 每宏块比特数
      '-alpha_bits', '16',                        // Alpha通道使用最高位深(16bit)
      '-movflags', '+faststart',                  // 快速启动 (元数据前置)
      outputPath,                                 // 输出路径
    ];

    const proc = spawn('ffmpeg', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderrData = '';

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderrData += text;

      // 解析 FFmpeg 进度 (从 stderr 中找 frame= 信息)
      if (onProgress && totalFrames > 0) {
        const frameMatch = text.match(/frame=\s*(\d+)/);
        if (frameMatch) {
          const currentFrame = parseInt(frameMatch[1], 10);
          onProgress(currentFrame, totalFrames);
        }
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const stats = fs.statSync(outputPath);
        resolve({
          outputPath,
          fileSize: stats.size,
        });
      } else {
        reject(new Error(`FFmpeg 编码失败 (exit code: ${code})\n${stderrData.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg 启动失败: ${err.message}\n请确保 FFmpeg 已安装并在 PATH 中`));
    });
  });
}

/**
 * 使用 ffprobe 验证输出视频是否包含 Alpha 通道
 * @param {string} videoPath - 视频文件路径
 * @returns {{hasAlpha: boolean, codec: string, pixFmt: string, width: number, height: number, duration: string}}
 */
function verifyVideo(videoPath) {
  try {
    const result = execSync(
      `ffprobe -v quiet -select_streams v:0 -show_entries stream=codec_name,pix_fmt,width,height -show_entries format=duration -of json "${videoPath}"`,
      { encoding: 'utf-8' }
    );

    const info = JSON.parse(result);
    const stream = info.streams && info.streams[0];
    const format = info.format;

    if (!stream) {
      return { hasAlpha: false, error: '无法读取视频流信息' };
    }

    const pixFmt = stream.pix_fmt || '';
    const hasAlpha = pixFmt.includes('yuva') || pixFmt.includes('rgba') || pixFmt.includes('gbrap');

    return {
      hasAlpha,
      codec: stream.codec_name,
      pixFmt,
      width: stream.width,
      height: stream.height,
      duration: format ? format.duration : 'unknown',
    };
  } catch (err) {
    return { hasAlpha: false, error: `ffprobe 验证失败: ${err.message}` };
  }
}

/**
 * 检查 FFmpeg 是否可用且支持 ProRes
 * @returns {{available: boolean, hasProres: boolean, version: string}}
 */
function checkFfmpeg() {
  try {
    const version = execSync('ffmpeg -version', { encoding: 'utf-8' }).split('\n')[0];
    
    let hasProres = false;
    try {
      const encoders = execSync('ffmpeg -encoders 2>&1', { encoding: 'utf-8' });
      hasProres = encoders.includes('prores_ks');
    } catch (e) {
      // ignore
    }

    return { available: true, hasProres, version };
  } catch (err) {
    return { available: false, hasProres: false, version: '' };
  }
}

module.exports = {
  encodeVideo,
  verifyVideo,
  checkFfmpeg,
};
