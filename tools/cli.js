/**
 * 交互式命令行界面模块
 * 使用 inquirer 提供友好的命令行交互体验
 */
const inquirer = require('inquirer');
const chalk = require('chalk');
const { formatDuration, formatFileSize } = require('./utils');

/**
 * 显示欢迎信息
 */
function showBanner() {
  console.log('');
  console.log(chalk.cyan.bold('╔══════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║    SVG 动画 → 透明视频 导出工具         ║'));
  console.log(chalk.cyan.bold('║    输出格式: MOV (ProRes 4444 + Alpha)  ║'));
  console.log(chalk.cyan.bold('╚══════════════════════════════════════════╝'));
  console.log('');
}

/**
 * 文件选择
 * @param {Array<{name: string, fullPath: string}>} files - 可选文件列表
 * @returns {Promise<Array>} 用户选择的文件
 */
async function selectFiles(files) {
  if (files.length === 0) {
    console.log(chalk.red('✗ 未找到任何 SVG 文件！'));
    console.log(chalk.gray('  请将 .svg 文件放到工作目录中'));
    process.exit(1);
  }

  if (files.length === 1) {
    console.log(chalk.green(`✓ 找到 1 个SVG文件: ${files[0].name}`));
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: '是否导出此文件？',
      default: true,
    }]);
    return confirm ? files : [];
  }

  console.log(chalk.green(`✓ 找到 ${files.length} 个SVG文件`));

  // 先询问是全部导出还是手动选择
  const { selectMode } = await inquirer.prompt([{
    type: 'list',
    name: 'selectMode',
    message: '选择导出范围:',
    choices: [
      { name: `全部导出 (${files.length} 个文件)`, value: 'all' },
      { name: '手动选择文件', value: 'manual' },
    ],
  }]);

  if (selectMode === 'all') {
    files.forEach(f => console.log(chalk.gray(`  - ${f.name}`)));
    return files;
  }

  const { selected } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selected',
    message: '选择要导出的SVG文件 (空格键选中/取消):',
    choices: files.map(f => ({
      name: f.name,
      value: f,
      checked: false,
    })),
    validate: (answer) => {
      if (answer.length === 0) return '请至少选择一个文件';
      return true;
    },
  }]);

  return selected;
}

/**
 * 显示动画分析结果
 */
function showAnimationInfo(fileName, animInfo) {
  console.log('');
  console.log(chalk.yellow(`── ${fileName} 动画分析 ──`));
  console.log(`  总动画数: ${chalk.bold(animInfo.totalAnimations)}  引擎: ${chalk.bold(animInfo.engineType === 'css' ? 'CSS' : animInfo.engineType === 'smil' ? 'SMIL' : animInfo.engineType === 'mixed' ? 'CSS+SMIL' : '无')}`);
  
  if (animInfo.hasEntrance) {
    console.log(`  ${chalk.green('▶ 开场动画')}: ${animInfo.entranceCount} 个, 总时长 ${chalk.bold(formatDuration(animInfo.entranceDuration))}`);
    animInfo.entrance.forEach(a => {
      console.log(chalk.gray(`    - ${a.name} (${formatDuration(a.duration)}, 延迟 ${formatDuration(a.delay)})`));
    });
  } else {
    console.log(chalk.gray('  ○ 无开场动画'));
  }

  if (animInfo.hasLoop) {
    console.log(`  ${chalk.blue('↻ 循环动画')}: ${animInfo.loopCount} 个, 周期 ${chalk.bold(formatDuration(animInfo.loopCycleDuration))}`);
    animInfo.loop.forEach(a => {
      console.log(chalk.gray(`    - ${a.name} (${formatDuration(a.duration)}, ${a.direction})`));
    });
  } else {
    console.log(chalk.gray('  ○ 无循环动画'));
  }
  console.log('');
}

/**
 * 选择导出模式（开场/循环/完整/分别导出）
 * @param {Object} animInfo - 动画分析信息
 * @returns {Promise<string>} 导出模式
 */
async function selectExportMode(animInfo) {
  // 无动画的情况
  if (!animInfo.hasEntrance && !animInfo.hasLoop) {
    console.log(chalk.yellow('  ⚠ 未检测到任何动画，跳过此文件'));
    return null;
  }

  const choices = [];

  if (animInfo.hasEntrance) {
    choices.push({
      name: `仅开场动画 (${formatDuration(animInfo.entranceDuration)}, 1个文件)`,
      value: 'entrance',
    });
  }

  if (animInfo.hasLoop) {
    choices.push({
      name: `仅循环动画 (${formatDuration(animInfo.loopCycleDuration)}, 1个文件)`,
      value: 'loop',
    });
  }

  if (animInfo.hasEntrance && animInfo.hasLoop) {
    choices.push({
      name: `完整动画 - 开场+循环 (${formatDuration(animInfo.entranceDuration + animInfo.loopCycleDuration)}, 1个文件)`,
      value: 'both',
    });
    choices.push({
      name: `分别导出 - 开场和循环各一个文件 (2个文件)`,
      value: 'separate',
    });
  }

  // 如果只有一种动画类型，只有一个选项
  if (choices.length === 1) {
    console.log(chalk.gray(`  导出模式: ${choices[0].name}`));
    return choices[0].value;
  }

  const { mode } = await inquirer.prompt([{
    type: 'list',
    name: 'mode',
    message: '选择导出模式:',
    choices,
  }]);

  return mode;
}

/**
 * 选择导出参数（帧率、缩放）
 * @returns {Promise<{fps: number, scale: number}>}
 */
async function selectExportSettings() {
  const { fps, scale } = await inquirer.prompt([
    {
      type: 'list',
      name: 'fps',
      message: '选择帧率 (FPS):',
      choices: [
        { name: '24 fps (电影)', value: 24 },
        { name: '25 fps (PAL)', value: 25 },
        { name: '30 fps (推荐)', value: 30 },
        { name: '60 fps (高帧率)', value: 60 },
      ],
      default: 2, // 默认选中 30fps
    },
    {
      type: 'list',
      name: 'scale',
      message: '选择输出缩放 (越高越清晰，文件越大):',
      choices: [
        { name: '2x', value: 2 },
        { name: '3x', value: 3 },
        { name: '4x (推荐, 最高质量)', value: 4 },
        { name: '6x (超高清, 文件较大)', value: 6 },
        { name: '8x (极致, 文件很大)', value: 8 },
      ],
      default: 2, // 默认选中 4x
    },
  ]);

  return { fps, scale };
}

/**
 * 显示导出任务摘要并确认
 * @param {Array} tasks - 导出任务列表
 * @returns {Promise<boolean>} 是否确认开始
 */
async function confirmExport(tasks) {
  console.log('');
  console.log(chalk.cyan.bold('═══ 导出任务摘要 ═══'));
  tasks.forEach((task, i) => {
    console.log(`  ${i + 1}. ${chalk.bold(task.svgName)}`);
    console.log(`     模式: ${chalk.yellow(task.modeLabel)}`);
    console.log(`     输出: ${task.outputFiles.map(f => chalk.green(f)).join(', ')}`);
    console.log(`     尺寸: ${task.outputWidth}×${task.outputHeight}  帧率: ${task.fps}fps`);
  });
  console.log('');

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: '确认开始导出？',
    default: true,
  }]);

  return confirm;
}

/**
 * 获取导出模式的中文标签
 */
function getModeLabel(mode) {
  const labels = {
    'entrance': '仅开场动画',
    'loop': '仅循环动画',
    'both': '完整动画（开场+循环）',
    'separate': '分别导出（开场+循环各一个文件）',
  };
  return labels[mode] || mode;
}

module.exports = {
  showBanner,
  selectFiles,
  showAnimationInfo,
  selectExportMode,
  selectExportSettings,
  confirmExport,
  getModeLabel,
};
