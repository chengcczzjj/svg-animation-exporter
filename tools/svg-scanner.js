/**
 * SVG文件扫描和解析模块
 * 负责发现SVG文件并读取其元数据
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

/**
 * 扫描指定目录下的所有SVG文件
 * @param {string} directory - 要扫描的目录路径
 * @returns {Array<{name: string, fullPath: string}>} SVG文件列表
 */
function scanSvgFiles(directory) {
  const files = fs.readdirSync(directory);
  return files
    .filter(f => {
      const ext = path.extname(f).toLowerCase();
      return config.supportedExtensions.includes(ext);
    })
    .filter(f => !f.startsWith('.')) // 排除隐藏文件
    .map(f => ({
      name: f,
      fullPath: path.resolve(directory, f),
    }));
}

/**
 * 从SVG内容中解析画布尺寸
 * 优先使用 width/height 属性，回退到 viewBox
 * @param {string} svgContent - SVG文件内容
 * @returns {{width: number, height: number}} 尺寸信息
 */
function parseSvgDimensions(svgContent) {
  // 匹配 <svg> 标签上的 width/height 属性 (仅纯数字，忽略百分比等)
  const widthMatch = svgContent.match(/<svg[^>]*\bwidth="(\d+(?:\.\d+)?)(?:px)?"/);
  const heightMatch = svgContent.match(/<svg[^>]*\bheight="(\d+(?:\.\d+)?)(?:px)?"/);
  const viewBoxMatch = svgContent.match(/<svg[^>]*\bviewBox="([^"]+)"/);

  let width, height;

  if (widthMatch && heightMatch) {
    width = parseFloat(widthMatch[1]);
    height = parseFloat(heightMatch[1]);
  }

  // 如果 width/height 无法解析为数字（如百分比），回退到 viewBox
  if ((!width || !height || isNaN(width) || isNaN(height)) && viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/);
    width = parseFloat(parts[2]);
    height = parseFloat(parts[3]);
  }

  if (!width || !height || isNaN(width) || isNaN(height)) {
    throw new Error('无法解析SVG尺寸：请确保SVG标签有 width/height 属性或 viewBox 属性');
  }

  // 取整
  width = Math.ceil(width);
  height = Math.ceil(height);

  return { width, height };
}

/**
 * 获取SVG文件的完整信息
 * @param {string} filePath - SVG文件路径
 * @returns {{name: string, fullPath: string, width: number, height: number, fileSize: number}}
 */
function getSvgInfo(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { width, height } = parseSvgDimensions(content);
  const stats = fs.statSync(filePath);

  return {
    name: path.basename(filePath),
    fullPath: filePath,
    width,
    height,
    fileSize: stats.size,
    content, // 保留内容供后续使用
  };
}

module.exports = {
  scanSvgFiles,
  parseSvgDimensions,
  getSvgInfo,
};
