/**
 * 帧截图模块
 * 使用 Puppeteer 打开SVG动画，通过 Web Animations API 控制时间线，逐帧截取透明PNG
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { ensureEven, cleanDir, sleep, lcmArray } = require('./utils');

/**
 * 构建HTML包装器
 * 将SVG内容嵌入一个透明背景的HTML页面中
 */
function createHtmlWrapper(svgContent, width, height) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
    background: transparent;
  }
  /* 确保SVG以最高质量渲染 */
  svg {
    display: block;
    width: ${width}px;
    height: ${height}px;
    shape-rendering: geometricPrecision;
    text-rendering: geometricPrecision;
    image-rendering: optimizeQuality;
  }
</style>
</head>
<body>
${svgContent}
</body>
</html>`;
}

/**
 * 在浏览器页面中分析动画信息
 * 同时检测 CSS 动画 (Web Animations API) 和 SMIL 动画 (<animate> 等元素)
 * @param {import('puppeteer').Page} page
 * @returns {Promise<Object>} 动画分析结果
 */
async function analyzeAnimations(page) {
  return await page.evaluate(() => {
    // ===== 1. 检测 CSS 动画 (Web Animations API) =====
    const cssAnimations = document.getAnimations();
    const entrance = [];
    const loop = [];

    cssAnimations.forEach((anim, index) => {
      const timing = anim.effect.getComputedTiming();
      const isInfinite = timing.iterations === Infinity;
      const animName = anim.animationName || `css_anim_${index}`;

      const info = {
        index,
        name: animName,
        type: 'css',
        duration: timing.duration,
        delay: timing.delay,
        iterations: timing.iterations,
        direction: timing.direction,
        fill: timing.fill,
        isInfinite,
      };

      if (isInfinite) {
        if (timing.direction === 'alternate' || timing.direction === 'alternate-reverse') {
          info.cycleDuration = timing.duration * 2;
        } else {
          info.cycleDuration = timing.duration;
        }
        loop.push(info);
      } else {
        info.totalDuration = timing.delay + timing.duration * timing.iterations;
        entrance.push(info);
      }
    });

    // ===== 2. 检测 SMIL 动画 (<animate>, <animateTransform>, <animateMotion>, <set>) =====
    const smilTags = ['animate', 'animateTransform', 'animateMotion', 'set'];
    const smilElements = [];
    smilTags.forEach(tag => {
      document.querySelectorAll(tag).forEach(el => smilElements.push(el));
    });

    const smilLoop = [];
    const smilEntrance = [];

    smilElements.forEach((el, index) => {
      const dur = el.getAttribute('dur');
      const repeatCount = el.getAttribute('repeatCount');
      const begin = el.getAttribute('begin') || '0s';

      // 解析时长 (支持 "6s", "500ms", "2")
      let durationMs = 0;
      if (dur) {
        if (dur.endsWith('ms')) {
          durationMs = parseFloat(dur);
        } else if (dur.endsWith('s')) {
          durationMs = parseFloat(dur) * 1000;
        } else if (dur !== 'indefinite') {
          durationMs = parseFloat(dur) * 1000;
        }
      }

      // 解析延迟
      let delayMs = 0;
      if (begin && begin !== '0s' && begin !== '0') {
        if (begin.endsWith('ms')) {
          delayMs = parseFloat(begin);
        } else if (begin.endsWith('s')) {
          delayMs = parseFloat(begin) * 1000;
        } else if (!isNaN(parseFloat(begin))) {
          delayMs = parseFloat(begin) * 1000;
        }
      }

      const tagName = el.tagName.toLowerCase();
      const attrName = el.getAttribute('attributeName') || tagName;
      const isInfinite = repeatCount === 'indefinite';

      const info = {
        index,
        name: `smil_${attrName}_${index}`,
        type: 'smil',
        duration: durationMs,
        delay: delayMs,
        isInfinite,
        tagName,
        repeatCount: repeatCount || '1',
      };

      if (isInfinite) {
        info.cycleDuration = durationMs;
        smilLoop.push(info);
      } else {
        const count = parseFloat(repeatCount) || 1;
        info.totalDuration = delayMs + durationMs * count;
        smilEntrance.push(info);
      }
    });

    // ===== 3. 合并结果 =====
    const allEntrance = [...entrance, ...smilEntrance];
    const allLoop = [...loop, ...smilLoop];

    const entranceDuration = allEntrance.length > 0
      ? Math.max(...allEntrance.map(a => a.totalDuration))
      : 0;

    let loopCycleDuration = 0;
    if (allLoop.length > 0) {
      const cycleDurations = allLoop.map(a => Math.round(a.cycleDuration));
      const unique = [...new Set(cycleDurations)].filter(d => d > 0);
      if (unique.length === 0) {
        loopCycleDuration = 0;
      } else if (unique.length === 1) {
        loopCycleDuration = unique[0];
      } else {
        let computed = unique.reduce((a, b) => {
          const result = (a * b) / gcd(a, b);
          return Math.min(result, 30000);
        });
        loopCycleDuration = computed;
      }
    }

    function gcd(a, b) {
      while (b) { [a, b] = [b, a % b]; }
      return a;
    }

    const hasCssAnimations = cssAnimations.length > 0;
    const hasSmilAnimations = smilElements.length > 0;

    return {
      totalAnimations: cssAnimations.length + smilElements.length,
      entranceCount: allEntrance.length,
      loopCount: allLoop.length,
      entranceDuration: Math.ceil(entranceDuration),
      loopCycleDuration: Math.ceil(loopCycleDuration),
      entrance: allEntrance,
      loop: allLoop,
      hasEntrance: allEntrance.length > 0,
      hasLoop: allLoop.length > 0,
      hasCssAnimations,
      hasSmilAnimations,
      // 动画引擎类型: 'css' | 'smil' | 'mixed' | 'none'
      engineType: hasCssAnimations && hasSmilAnimations ? 'mixed'
        : hasCssAnimations ? 'css'
        : hasSmilAnimations ? 'smil'
        : 'none',
    };
  });
}

/**
 * 截取动画帧序列
 * 
 * @param {Object} options
 * @param {string} options.svgPath - SVG文件路径
 * @param {string} options.svgContent - SVG文件内容
 * @param {number} options.width - SVG原始宽度
 * @param {number} options.height - SVG原始高度
 * @param {number} options.fps - 帧率
 * @param {number} options.scale - 缩放因子
 * @param {'entrance'|'loop'|'both'} options.animationType - 导出的动画类型
 * @param {string} options.framesDir - 帧输出目录
 * @param {Function} [options.onProgress] - 进度回调 (current, total)
 * @param {Function} [options.onAnalyzed] - 动画分析完成回调
 * @returns {Promise<Object>} 截取结果
 */
async function captureFrames(options) {
  const {
    svgPath,
    svgContent,
    width,
    height,
    fps = config.defaultFps,
    scale = config.defaultScale,
    animationType = 'both',
    framesDir,
    onProgress,
    onAnalyzed,
  } = options;

  // 准备帧输出目录
  cleanDir(framesDir);

  // 计算视口和输出尺寸
  // 视口设置为原始SVG尺寸，通过 deviceScaleFactor 实现高分辨率渲染
  // 这样浏览器会以高DPI模式渲染SVG矢量图形，保证边缘平滑
  const viewportWidth = ensureEven(width);
  const viewportHeight = ensureEven(height);
  const outputWidth = ensureEven(width * scale);
  const outputHeight = ensureEven(height * scale);

  // 启动浏览器
  const browser = await puppeteer.launch({
    headless: true,
    args: config.puppeteer.args,
  });

  try {
    const page = await browser.newPage();

    // deviceScaleFactor = scale 让浏览器以高DPI渲染
    // SVG是矢量图形，高DPI下会重新光栅化，边缘非常平滑
    await page.setViewport({
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: scale,
    });

    // 加载SVG (使用HTML包装器确保透明背景)
    const htmlContent = createHtmlWrapper(svgContent, viewportWidth, viewportHeight);
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // 等待动画启动
    await sleep(200);

    // 分析动画
    const animInfo = await analyzeAnimations(page);
    if (onAnalyzed) onAnalyzed(animInfo);

    // 根据动画引擎类型选择控制方式
    const engineType = animInfo.engineType;

    // 暂停所有动画
    if (engineType === 'css' || engineType === 'mixed') {
      await page.evaluate(() => {
        document.getAnimations().forEach(a => a.pause());
      });
    }
    if (engineType === 'smil' || engineType === 'mixed') {
      await page.evaluate(() => {
        const svg = document.querySelector('svg');
        if (svg && svg.pauseAnimations) svg.pauseAnimations();
      });
    }

    // 根据动画类型计算时间范围
    let startTime, endTime;

    switch (animationType) {
      case 'entrance':
        startTime = 0;
        endTime = animInfo.entranceDuration;
        break;
      case 'loop':
        startTime = animInfo.entranceDuration;
        endTime = animInfo.entranceDuration + animInfo.loopCycleDuration;
        break;
      case 'both':
      default:
        startTime = 0;
        endTime = animInfo.entranceDuration + animInfo.loopCycleDuration;
        break;
    }

    // 添加尾部缓冲帧 (仅非循环模式)
    if (animationType !== 'loop') {
      endTime += (config.extraEndFrames / fps) * 1000;
    }

    const totalDuration = endTime - startTime;
    const totalFrames = Math.ceil(totalDuration / 1000 * fps);

    if (totalFrames <= 0) {
      // 返回空结果而不是报错，让上层处理
      return {
        framesDir,
        totalFrames: 0,
        fps,
        outputWidth,
        outputHeight,
        durationMs: 0,
        durationSec: '0',
        animInfo: await analyzeAnimations(page),
        animationType,
      };
    }

    // 逐帧截图
    for (let frame = 0; frame < totalFrames; frame++) {
      const currentTime = startTime + (frame / fps) * 1000;

      // 根据动画引擎类型设置时间
      if (engineType === 'css' || engineType === 'mixed') {
        // CSS 动画：通过 Web Animations API 设置时间 (单位: ms)
        await page.evaluate((t) => {
          document.getAnimations().forEach(a => {
            a.currentTime = t;
          });
        }, currentTime);
      }
      if (engineType === 'smil' || engineType === 'mixed') {
        // SMIL 动画：通过 SVG DOM API 设置时间 (单位: 秒)
        await page.evaluate((tSec) => {
          const svg = document.querySelector('svg');
          if (svg && svg.setCurrentTime) svg.setCurrentTime(tSec);
        }, currentTime / 1000);
      }

      // 同步执行SVG内嵌的JS脚本逻辑 (如百分比计数器等)
      // 因为 setCurrentTime 不会触发 requestAnimationFrame 回调
      await page.evaluate((tMs) => {
        // 查找SVG内所有<script>中可能定义的基于时间的更新函数
        // 通过重置 startTime 让基于 elapsed time 的逻辑正确计算
        window.startTime = performance.now() - tMs;
        
        // 针对常见模式：通过 id 查找文本元素并计算百分比
        // 进度条SVG使用 requestAnimationFrame 更新百分比数字
        // 我们需要手动触发一次更新
        const scripts = document.querySelectorAll('script');
        scripts.forEach(script => {
          const text = script.textContent || '';
          // 检测是否有 updateCounter 类型的函数
          const funcMatch = text.match(/function\s+(\w+)\s*\(\s*\w*\s*\)/g);
          if (funcMatch) {
            funcMatch.forEach(m => {
              const fnName = m.match(/function\s+(\w+)/)[1];
              if (typeof window[fnName] === 'function') {
                try { window[fnName](performance.now()); } catch(e) {}
              }
            });
          }
        });
      }, currentTime);

      // 等待浏览器完成渲染 (双重 rAF 确保帧已绘制)
      await page.evaluate(() =>
        new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
      );

      // 截取透明背景PNG
      const framePath = path.join(framesDir, `frame_${String(frame).padStart(5, '0')}.png`);
      await page.screenshot({
        path: framePath,
        omitBackground: true,
        type: 'png',
      });

      if (onProgress) onProgress(frame + 1, totalFrames);
    }

    return {
      framesDir,
      totalFrames,
      fps,
      outputWidth,
      outputHeight,
      durationMs: totalDuration,
      durationSec: (totalDuration / 1000).toFixed(2),
      animInfo,
      animationType,
    };
  } finally {
    await browser.close();
  }
}

module.exports = {
  captureFrames,
  analyzeAnimations,
  createHtmlWrapper,
};
