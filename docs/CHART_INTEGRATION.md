# 图表功能集成指南

## 当前架构

当前使用 **WebviewPanel** 显示股票详情，这为未来集成图表功能提供了完整的基础。

## 为什么选择 WebviewPanel？

1. **完整的 Web 技术栈支持**
   - 可以使用任何 JavaScript 图表库（ECharts、Chart.js、D3.js 等）
   - 支持 CSS 动画和复杂样式
   - 可以实现实时数据更新

2. **VS Code API 限制**
   - TreeView：只能显示文本和图标
   - QuickPick：只是简单的下拉列表
   - Tooltip：只支持纯文本/Markdown

## 未来扩展计划

### 1. 分时图功能

**实现步骤：**

```javascript
// 在 statusBar.js 的 WebView 消息处理中添加
this.hoverPanel.webview.onDidReceiveMessage((message) => {
  // ... 现有代码 ...
  
  if (message.command === 'showStockChart') {
    // 获取股票分时数据
    const chartData = await getStockMinuteData(message.code);
    // 发送数据到 WebView
    this.hoverPanel.webview.postMessage({
      command: 'updateChart',
      data: chartData
    });
  }
});
```

**WebView HTML 中集成 ECharts：**

```html
<!-- 在 <head> 中添加 -->
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>

<!-- 在点击股票行时显示图表 -->
<div id="chartContainer" style="display:none; height: 300px;"></div>

<script>
  // 接收后端发送的图表数据
  window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'updateChart') {
      showChart(message.data);
    }
  });
  
  function showChart(data) {
    const chart = echarts.init(document.getElementById('chartContainer'));
    chart.setOption({
      // ECharts 配置
      xAxis: { type: 'category', data: data.times },
      yAxis: { type: 'value' },
      series: [{ data: data.prices, type: 'line' }]
    });
  }
</script>
```

### 2. K线图功能

可以在同一个 WebView 中添加 K线图展示，用户点击股票后可以切换查看：
- 分时图
- 日K线
- 周K线
- 月K线

### 3. 技术指标

可以叠加显示：
- MACD
- KDJ
- RSI
- 成交量

### 4. 数据来源

需要添加新的服务来获取图表数据：

```javascript
// services/chartService.js
async function getStockMinuteData(code) {
  // 调用接口获取分时数据
  // 返回格式: { times: [], prices: [], volumes: [] }
}

async function getStockKLineData(code, period) {
  // 调用接口获取K线数据
  // period: 'day', 'week', 'month'
}
```

## 当前已实现的基础

✅ WebView 面板创建和管理  
✅ 鼠标事件监听（进入/离开）  
✅ 股票行点击事件处理（已预留）  
✅ 数据属性绑定（data-code, data-name）  
✅ 双向消息通信机制  

## 下一步建议

1. **添加图表库**
   - 推荐使用 ECharts（功能强大、文档完善、中文支持好）
   - 或使用 lightweight-charts（专门用于金融图表，性能好）

2. **创建图表服务**
   - 实现分时数据获取
   - 实现K线数据获取

3. **优化 UI 布局**
   - 股票列表 + 图表区域的布局设计
   - 可以使用左右分栏或上下分栏

4. **添加交互功能**
   - 点击股票显示图表
   - 鼠标悬停显示详细数据
   - 图表缩放和拖拽

## 示例：使用 ECharts 的完整实现

参考 `examples/echarts-integration.html` 查看完整示例代码。

## 注意事项

1. **性能优化**
   - 图表数据量大时需要做数据抽样
   - 使用虚拟滚动优化长列表

2. **安全性**
   - 所有外部数据都需要转义
   - 使用 CSP（Content Security Policy）限制脚本执行

3. **用户体验**
   - 加载图表时显示 loading 状态
   - 数据获取失败时的错误提示
   - 图表自适应窗口大小变化
