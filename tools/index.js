/**
 * 主入口 - SVG动画导出工具
 * 串联所有模块，实现完整的交互式导出流程
 */
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const cliProgress = require('cli-progress');

const config = require('./config');
const { scanSvgFiles, getSvgInfo } = require('./svg-scanner');
const { captureFrames } = require('./frame-capture');
const { encodeVideo, verifyVideo } = require('./video-encoder');
const { showBanner, selectFiles, showAnimationInfo, selectExportMode, selectExportSettings, confirmExport, getModeLabel } = require('./cli');
const { ensureEven, formatFileSize, ensureDir, cleanDir } = require('./utils');

/**
 * 执行单个导出任务 (截帧 + 编码)
 */
async function executeExportTask(task) {
  const {
    svgInfo,
    animationType,
    fps,
    scale,
    outputPath,
    label,
  } = task;

  const framesDir = path.join(
    config.outputDir,
    config.framesSubDir,
    `${path.basename(svgInfo.fullPath, '.svg')}_${animationType}`
  );

  // ===== 步骤1: 逐帧截图 =====
  console.log('');
  console.log(chalk.cyan(`📸 [${label}] 正在截取帧画面...`));

  const captureBar = new cliProgress.SingleBar({
    format: '  截帧进度 |' + chalk.green('{bar}') + '| {value}/{total} 帧 | {percentage}%',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
  });

  let animInfo;
  const captureResult = await captureFrames({
    svgPath: svgInfo.fullPath,
    svgContent: svgInfo.content,
    width: svgInfo.width,
    height: svgInfo.height,
    fps,
    scale,
    animationType,
    framesDir,
    onAnalyzed: (info) => {
      animInfo = info;
    },
    onProgress: (current, total) => {
      if (current === 1) captureBar.start(total, 0);
      captureBar.update(current);
      if (current === total) captureBar.stop();
    },
  });

  console.log(chalk.green(`  ✓ 截取完成: ${captureResult.totalFrames} 帧, 时长 ${captureResult.durationSec}s`));

  // ===== 步骤2: FFmpeg 编码 =====
  console.log(chalk.cyan(`🎬 [${label}] 正在编码视频...`));

  const encodeSpinner = ora('FFmpeg 编码中...').start();

  const encodeResult = await encodeVideo({
    framesDir,
    fps,
    outputPath,
    totalFrames: captureResult.totalFrames,
  });

  encodeSpinner.succeed(`编码完成: ${formatFileSize(encodeResult.fileSize)}`);

  // ===== 步骤3: 验证输出 =====
  const verification = verifyVideo(outputPath);
  if (verification.hasAlpha) {
    console.log(chalk.green(`  ✓ Alpha通道验证通过 (${verification.pixFmt})`));
  } else {
    console.log(chalk.red(`  ✗ 警告: 未检测到Alpha通道! (${verification.pixFmt || verification.error})`));
  }

  // 清理帧文件
  try {
    cleanDir(framesDir);
  } catch (e) {
    // 清理失败不影响主流程
  }

  return {
    outputPath,
    fileSize: encodeResult.fileSize,
    hasAlpha: verification.hasAlpha,
    ...captureResult,
  };
}

/**
 * 主流程
 */
async function main() {
  showBanner();

  // 1. 扫描SVG文件
  const workDir = path.resolve(__dirname, '..');
  const svgFiles = scanSvgFiles(workDir);

  // 2. 选择文件
  const selectedFiles = await selectFiles(svgFiles);
  if (selectedFiles.length === 0) {
    console.log(chalk.yellow('未选择任何文件，退出。'));
    return;
  }

  // 3. 选择导出参数 (帧率、缩放)
  const { fps, scale } = await selectExportSettings();

  // 4. 对每个文件分析动画并选择导出模式
  const tasks = [];

  for (const file of selectedFiles) {
    const svgInfo = getSvgInfo(file.fullPath);
    const outputWidth = ensureEven(svgInfo.width * scale);
    const outputHeight = ensureEven(svgInfo.height * scale);

    // 先用 Puppeteer 分析动画 (快速分析)
    const spinner = ora(`正在分析 ${file.name} 的动画...`).start();

    let animInfo;
    try {
      // 快速截取1帧以获取动画信息
      const tempFramesDir = path.join(config.outputDir, config.framesSubDir, '_temp_analysis');
      ensureDir(tempFramesDir);
      
      await captureFrames({
        svgPath: svgInfo.fullPath,
        svgContent: svgInfo.content,
        width: svgInfo.width,
        height: svgInfo.height,
        fps: 1,
        scale: 1,
        animationType: 'entrance',
        framesDir: tempFramesDir,
        onAnalyzed: (info) => { animInfo = info; },
        onProgress: () => {},
      });

      // 清理临时文件
      try { cleanDir(tempFramesDir); } catch(e) {}
    } catch (err) {
      spinner.fail(`分析 ${file.name} 失败: ${err.message}`);
      continue;
    }

    spinner.succeed(`${file.name} 分析完成`);
    showAnimationInfo(file.name, animInfo);

    // 选择导出模式
    const exportMode = await selectExportMode(animInfo);

    // 跳过无动画的文件
    if (exportMode === null) {
      continue;
    }

    // 构建导出任务
    const baseName = path.basename(file.name, '.svg');

    if (exportMode === 'separate') {
      // 分别导出：生成两个任务
      if (animInfo.hasEntrance) {
        tasks.push({
          svgInfo,
          animationType: 'entrance',
          fps,
          scale,
          outputPath: path.join(config.outputDir, `${baseName}_开场.mov`),
          outputFiles: [`${baseName}_开场.mov`],
          outputWidth,
          outputHeight,
          svgName: file.name,
          modeLabel: '开场动画',
          label: `${baseName} - 开场`,
        });
      }
      if (animInfo.hasLoop) {
        tasks.push({
          svgInfo,
          animationType: 'loop',
          fps,
          scale,
          outputPath: path.join(config.outputDir, `${baseName}_循环.mov`),
          outputFiles: [`${baseName}_循环.mov`],
          outputWidth,
          outputHeight,
          svgName: file.name,
          modeLabel: '循环动画',
          label: `${baseName} - 循环`,
        });
      }
    } else {
      // 单个任务
      let suffix = '';
      if (exportMode === 'entrance') suffix = '_开场';
      else if (exportMode === 'loop') suffix = '_循环';

      const outputFile = `${baseName}${suffix}.mov`;
      tasks.push({
        svgInfo,
        animationType: exportMode,
        fps,
        scale,
        outputPath: path.join(config.outputDir, outputFile),
        outputFiles: [outputFile],
        outputWidth,
        outputHeight,
        svgName: file.name,
        modeLabel: getModeLabel(exportMode),
        label: baseName,
      });
    }
  }

  if (tasks.length === 0) {
    console.log(chalk.yellow('没有要执行的导出任务。'));
    return;
  }

  // 5. 直接开始导出
  // 确保输出目录存在
  ensureDir(config.outputDir);
  ensureDir(path.join(config.outputDir, config.framesSubDir));

  // 6. 执行所有导出任务
  console.log('');
  console.log(chalk.cyan.bold(`开始导出 (共 ${tasks.length} 个任务)...`));

  const results = [];
  for (let i = 0; i < tasks.length; i++) {
    console.log(chalk.cyan.bold(`\n━━━ 任务 ${i + 1}/${tasks.length} ━━━`));
    try {
      const result = await executeExportTask(tasks[i]);
      results.push({ success: true, task: tasks[i], result });
    } catch (err) {
      console.log(chalk.red(`✗ 导出失败: ${err.message}`));
      results.push({ success: false, task: tasks[i], error: err.message });
    }
  }

  // 7. 最终报告
  console.log('');
  console.log(chalk.cyan.bold('═══ 导出完成 ═══'));
  results.forEach((r) => {
    if (r.success) {
      console.log(chalk.green(`  ✓ ${path.basename(r.task.outputPath)} (${formatFileSize(r.result.fileSize)})`));
    } else {
      console.log(chalk.red(`  ✗ ${path.basename(r.task.outputPath)}: ${r.error}`));
    }
  });
  console.log('');
  console.log(chalk.gray(`输出目录: ${config.outputDir}`));
  console.log(chalk.gray('提示: 将 .mov 文件直接导入剪映即可自动识别透明背景'));
  console.log('');

  // 清理 frames 临时目录
  const framesRoot = path.join(config.outputDir, config.framesSubDir);
  try {
    const remaining = require('fs').readdirSync(framesRoot);
    if (remaining.length === 0) {
      require('fs').rmdirSync(framesRoot);
    }
  } catch (e) {
    // 忽略清理错误
  }
}

// 运行主程序
main().catch((err) => {
  console.error(chalk.red(`\n程序错误: ${err.message}`));
  console.error(chalk.gray(err.stack));
  process.exit(1);
});
