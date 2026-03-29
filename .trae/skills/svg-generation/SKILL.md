---
name: SVG生成
description: 生成 SVG 图标、SVG 动画、带动效的矢量图形代码，或高级感矢量视觉资产时调用。
---

# 输出要求

直接输出可独立运行的纯净 `<svg>` 代码，不包裹 HTML 或外部依赖。

# 纠偏规则

以下是你默认行为中容易犯的错误，必须逐条遵守：

1. **禁用高饱和色**：不要用 #FF0000、#0000FF 等安全色。使用低饱和莫兰迪色系或黑白灰，配合 `stop-opacity` 渐变做柔和质感。

2. **viewBox 预留溢出空间**：动画含缩放/位移/`drop-shadow` 时，必须扩大 `viewBox`（四周各加余量），否则边缘会被裁切。

3. **居中定位与动画分层**：禁止在有 CSS 动画的节点上写静态 `transform="translate(...)"`（会被 `@keyframes` 覆盖）。用外层 `<g transform="translate(...)">` 包裹来定位。

4. **交错动画**：多个同类元素必须设置等差 `animation-delay` 产生层次感，并显式声明 `transform-origin`。

5. **自定义缓动**：禁用默认 `ease`/`ease-in-out`，按场景选用：
   - 弹性回弹：`cubic-bezier(0.175, 0.885, 0.32, 1.275)`
   - 丝滑减速：`cubic-bezier(0.25, 1, 0.5, 1)`
   - 快起慢停：`cubic-bezier(0.16, 1, 0.3, 1)`

6. **线条用描边生长**：线条动画禁止用 `opacity` 渐隐，必须用 `stroke-dasharray` + `stroke-dashoffset` 实现描边追踪效果。

7. **模糊渐显**：元素出场优先使用 `feGaussianBlur` 的 `stdDeviation` 从大到小动画配合 `opacity`，而非单纯 `opacity` 渐入。

8. **遮罩揭示**：区域性内容展示优先使用 `<clipPath>` 或 `<mask>` 动画实现擦除/揭示效果，而非整体淡入。

9. **路径形变**：当需要图形变换时，优先使用相同节点数的 `<path d="...">` 在关键帧间插值实现 morphing，而非替换/交叉淡入。