/**
 * 测试脚本 - SVG动画导出工具
 * 
 * 验证各模块功能是否正常：
 *   1. SVG扫描和尺寸解析
 *   2. Puppeteer帧截图 (含透明度检查)
 *   3. FFmpeg编码 (含Alpha通道验证)
 * 
 * 使用方法: npm test 或 node tools/test.js
 */
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const ora = require('ora');

const config = require('./config');
const { scanSvgFiles, parseSvgDimensions } = require('./svg-scanner');
const { captureFrames } = require('./frame-capture');
const { encodeVideo, verifyVideo, checkFfmpeg } = require('./video-encoder');
const { checkPngHasAlpha, ensureDir, cleanDir, formatFileSize } = require('./utils');

// 测试用的迷你SVG (有开场动画 + 循环动画)
const TEST_SVG = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" width="200" height="200" fill="none">
  <style>
    @keyframes fadeIn {
      0% { opacity: 0; transform: scale(0.5); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes bob {
      0% { transform: translateY(0px); }
      100% { transform: translateY(-15px); }
    }
    .test-circle {
      opacity: 0;
      transform-origin: 100px 100px;
      animation:
        fadeIn 0.8s ease-out 0.2s forwards,
        bob 1.5s ease-in-out 1.0s infinite alternate;
    }
  </style>
  <circle class="test-circle" cx="100" cy="100" r="60" fill="#FF6B6B" fill-opacity="0.8"/>
  <circle class="test-circle" cx="100" cy="100" r="30" fill="#4ECDC4" fill-opacity="0.9" style="animation-delay: 0.4s, 1.2s;"/>
</svg>`;

let passCount = 0;
let failCount = 0;

function pass(testName) {
  passCount++;
  console.log(chalk.green(`  ✓ ${testName}`));
}

function fail(testName, error) {
  failCount++;
  console.log(chalk.red(`  ✗ ${testName}`));
  console.log(chalk.gray(`    错误: ${error}`));
}

async function runTests() {
  console.log('');
  console.log(chalk.cyan.bold('═══ SVG动画导出工具 - 测试 ═══'));
  console.log('');

  const testDir = path.join(config.outputDir, '_test');
  const testSvgPath = path.join(testDir, 'test.svg');
  const testFramesDir = path.join(testDir, 'frames');
  const testVideoPath = path.join(testDir, 'test_output.mov');

  try {
    // 准备测试环境
    ensureDir(testDir);
    fs.writeFileSync(testSvgPath, TEST_SVG, 'utf-8');

    // ===== 测试 1: SVG 扫描 =====
    console.log(chalk.yellow('测试 1: SVG 文件扫描'));
    try {
      const files = scanSvgFiles(testDir);
      if (files.length > 0 && files[0].name === 'test.svg') {
        pass('扫描到测试SVG文件');
      } else {
        fail('扫描SVG文件', `期望找到 test.svg, 实际: ${JSON.stringify(files)}`);
      }
    } catch (err) {
      fail('扫描SVG文件', err.message);
    }

    // ===== 测试 2: SVG 尺寸解析 =====
    console.log(chalk.yellow('\n测试 2: SVG 尺寸解析'));
    try {
      const dims = parseSvgDimensions(TEST_SVG);
      if (dims.width === 200 && dims.height === 200) {
        pass(`解析尺寸正确: ${dims.width}×${dims.height}`);
      } else {
        fail('解析尺寸', `期望 200×200, 实际 ${dims.width}×${dims.height}`);
      }
    } catch (err) {
      fail('解析尺寸', err.message);
    }

    // ===== 测试 3: FFmpeg 环境 =====
    console.log(chalk.yellow('\n测试 3: FFmpeg 环境检查'));
    const ffmpegInfo = checkFfmpeg();
    if (ffmpegInfo.available) {
      pass(`FFmpeg 可用: ${ffmpegInfo.version.substring(0, 60)}`);
    } else {
      fail('FFmpeg 可用性', 'FFmpeg 未安装或不在 PATH 中');
    }
    if (ffmpegInfo.hasProres) {
      pass('FFmpeg 支持 ProRes 编码器 (prores_ks)');
    } else {
      fail('ProRes 支持', 'FFmpeg 缺少 prores_ks 编码器');
    }

    // ===== 测试 4: 帧截图 (开场动画) =====
    console.log(chalk.yellow('\n测试 4: Puppeteer 帧截图'));
    let captureResult;
    try {
      const spinner = ora('启动 Puppeteer 截帧测试...').start();

      captureResult = await captureFrames({
        svgPath: testSvgPath,
        svgContent: TEST_SVG,
        width: 200,
        height: 200,
        fps: 10,           // 低帧率加速测试
        scale: 1,           // 原始尺寸
        animationType: 'entrance',
        framesDir: testFramesDir,
        onAnalyzed: (info) => {
          spinner.succeed('Puppeteer 分析完成');
          console.log(chalk.gray(`    开场动画: ${info.entranceCount}个, ${info.entranceDuration}ms`));
          console.log(chalk.gray(`    循环动画: ${info.loopCount}个, 周期${info.loopCycleDuration}ms`));

          if (info.entranceCount > 0) {
            pass(`检测到 ${info.entranceCount} 个开场动画`);
          } else {
            fail('检测开场动画', '未检测到开场动画');
          }
          if (info.loopCount > 0) {
            pass(`检测到 ${info.loopCount} 个循环动画`);
          } else {
            fail('检测循环动画', '未检测到循环动画');
          }
        },
        onProgress: () => {},
      });

      if (captureResult.totalFrames > 0) {
        pass(`截取了 ${captureResult.totalFrames} 帧`);
      } else {
        fail('帧截取', '未截取到任何帧');
      }
    } catch (err) {
      fail('帧截图', err.message);
    }

    // ===== 测试 5: PNG 透明度验证 =====
    console.log(chalk.yellow('\n测试 5: PNG 透明度验证'));
    try {
      const firstFrame = path.join(testFramesDir, 'frame_00000.png');
      if (fs.existsSync(firstFrame)) {
        const hasAlpha = checkPngHasAlpha(firstFrame);
        if (hasAlpha) {
          pass('PNG帧包含Alpha通道 (RGBA)');
        } else {
          fail('PNG透明度', 'PNG帧不包含Alpha通道 (可能是RGB而非RGBA)');
        }

        // 检查文件大小是否合理
        const frameSize = fs.statSync(firstFrame).size;
        if (frameSize > 100) {
          pass(`帧文件大小合理: ${formatFileSize(frameSize)}`);
        } else {
          fail('帧文件大小', `文件过小: ${frameSize} bytes`);
        }
      } else {
        fail('PNG文件存在', '第一帧文件不存在');
      }
    } catch (err) {
      fail('PNG透明度验证', err.message);
    }

    // ===== 测试 6: FFmpeg 视频编码 =====
    console.log(chalk.yellow('\n测试 6: FFmpeg 视频编码'));
    if (captureResult && ffmpegInfo.available && ffmpegInfo.hasProres) {
      try {
        const spinner = ora('FFmpeg 编码测试...').start();

        const encodeResult = await encodeVideo({
          framesDir: testFramesDir,
          fps: captureResult.fps,
          outputPath: testVideoPath,
          totalFrames: captureResult.totalFrames,
        });

        spinner.succeed('FFmpeg 编码完成');
        pass(`输出文件: ${formatFileSize(encodeResult.fileSize)}`);

        // 验证输出
        const verification = verifyVideo(testVideoPath);
        if (verification.hasAlpha) {
          pass(`Alpha通道验证通过 (编码器: ${verification.codec}, 格式: ${verification.pixFmt})`);
          pass(`视频尺寸: ${verification.width}×${verification.height}`);
        } else {
          fail('视频Alpha通道', `未检测到Alpha (${verification.pixFmt || verification.error})`);
        }
      } catch (err) {
        fail('FFmpeg编码', err.message);
      }
    } else {
      console.log(chalk.gray('  ⊘ 跳过 (前置条件不满足)'));
    }

  } finally {
    // 清理测试文件
    console.log(chalk.yellow('\n清理测试文件...'));
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
      console.log(chalk.gray('  清理完成'));
    } catch (e) {
      console.log(chalk.gray(`  清理失败 (可手动删除 ${testDir}): ${e.message}`));
    }
  }

  // 测试报告
  console.log('');
  console.log(chalk.cyan.bold('═══ 测试报告 ═══'));
  console.log(chalk.green(`  通过: ${passCount}`));
  if (failCount > 0) {
    console.log(chalk.red(`  失败: ${failCount}`));
  } else {
    console.log(chalk.gray(`  失败: 0`));
  }
  console.log('');

  if (failCount === 0) {
    console.log(chalk.green.bold('🎉 所有测试通过！可以运行 npm start 开始导出。'));
  } else {
    console.log(chalk.yellow('⚠  部分测试失败，请检查上方错误信息。'));
  }
  console.log('');

  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error(chalk.red(`测试程序错误: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
