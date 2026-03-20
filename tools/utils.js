/**
 * 工具函数模块
 * 提供通用的辅助功能
 */
const fs = require('fs');

/**
 * 最大公约数
 */
function gcd(a, b) {
  a = Math.round(a);
  b = Math.round(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * 最小公倍数
 */
function lcm(a, b) {
  if (a === 0 || b === 0) return 0;
  return Math.abs(Math.round(a) * Math.round(b)) / gcd(a, b);
}

/**
 * 计算多个数的最小公倍数
 */
function lcmArray(numbers) {
  if (numbers.length === 0) return 0;
  return numbers.reduce((acc, n) => lcm(acc, n));
}

/**
 * 确保数值为偶数（视频编码要求）
 * 向上取整到偶数
 */
function ensureEven(n) {
  n = Math.ceil(n);
  return n % 2 === 0 ? n : n + 1;
}

/**
 * 确保目录存在
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 清空并重建目录
 */
function cleanDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * 格式化时长 (ms -> 可读字符串)
 */
function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * 检查PNG文件是否有Alpha通道
 * 通过读取PNG的IHDR chunk的colorType字段判断
 * colorType=6 表示 RGBA（带Alpha）
 */
function checkPngHasAlpha(pngPath) {
  const buffer = fs.readFileSync(pngPath);
  if (buffer.length < 26) return false;
  
  // PNG签名: 89 50 4E 47 0D 0A 1A 0A (8 bytes)
  // IHDR chunk: length(4) + "IHDR"(4) + width(4) + height(4) + bitDepth(1) + colorType(1)
  // colorType 在第 25 字节 (0-indexed)
  const colorType = buffer[25];
  return colorType === 6; // 6 = RGBA
}

/**
 * 延时函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  gcd,
  lcm,
  lcmArray,
  ensureEven,
  ensureDir,
  cleanDir,
  formatDuration,
  formatFileSize,
  checkPngHasAlpha,
  sleep,
};
